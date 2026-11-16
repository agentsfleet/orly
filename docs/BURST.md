---
type: how-to
audience: operator
verified: 2026-11-16
product_version: 0.40.0
executable: false
---

# Run burst lanes on a rented machine

## What this does

`orly burst` runs a repository's slow lanes, such as acceptance tests, on a machine rented for the run.
Amazon Web Services (AWS) Spot and E2E Networks start one machine per lane, in parallel, and delete each machine when its lane ends.
The `here` provider runs the same lanes on the current machine, which is how a Continuous Integration (CI) job runs them.

The gates never run `burst.*` commands.
Every cloud run costs money, so it runs only when someone asks for it.

```text
caller: a workstation or a CI job              rented machine
  1. read burst.secrets (environment or op)
  2. bundle the ref with git
  3. create the machine ------- cloud API ---> boots the newest snapshot
  4. ssh: cat > bundle -------- SSH ---------> /tmp/orly-burst.bundle
  5. ssh: bash -s ------------- SSH ---------> setup, then secrets, then lane
     [lane] log lines <-------- SSH ---------- standard output and errors
  6. ssh: tar of results <----- SSH ---------- burst.artifacts that exist
  7. delete the machine, the key and the security group
```

One transport serves both clouds: Secure Shell (SSH), with a key pair made for the run.
Nothing is staged in object storage, and no secret is stored in the cloud.

## Before you begin

Declare the lanes as `burst.<name>` commands, and the `burst` object beside them in `.orly/orly.json`:

```json
{
  "commands": {
    "verify.unit": [["make", "test-unit-all"]],
    "burst.acceptance": [["make", "acceptance", "SUITE=all"]],
    "burst.integration": [["make", "test-integration-rustd"]]
  },
  "burst": {
    "setup": [["apt-get", "install", "-y", "-qq", "lsof"], ["make", "deps"]],
    "warm": [["make", "build-all"]],
    "secrets": {
      "CLERK_SECRET_KEY": "op://<VAULT>/clerk-dev/secret-key",
      "FIREWORKS_API_KEY": "op://<VAULT>/fireworks/credential"
    },
    "artifacts": ["ui/packages/app/playwright-acceptance-results", "ui/packages/app/playwright-acceptance-report"]
  }
}
```

Replace `<VAULT>` with the 1Password vault that holds the items.
An `agentsfleet` setup installs `lsof` for its readiness checks, then its own toolchains.

| Field | Effect | Default |
|---|---|---|
| `burst.<name>` command | One lane. A name has 1 to 24 lowercase letters, digits or hyphens. | none |
| `burst.setup` | Runs before every lane and every snapshot warm-up, with no secret. Keep it idempotent and fast on a warm machine. | none |
| `burst.warm` | Runs after setup when a snapshot is captured, with no secret, to fill build caches. | none |
| `burst.secrets` | Environment variable name to an `op://` reference, read on the caller. | none |
| `burst.artifacts` | Paths below the checkout to bring back. A missing path is skipped. | none |

Each machine installs Git, curl, unzip, Docker and the Docker Compose plugin on its first boot.
A repository installs anything else it needs in `burst.setup`, which runs as root.

Every lane runs with `CI=1`, so test runners write their reports.
Under `--provider here`, a `CI` value the caller already set wins.

The caller needs `git`, `ssh`, `ssh-keygen` and `tar`, and the provider's credentials below.
A secret already exported in the caller's environment is used as it is.
Any other secret is read with `op read`, so `op` must be signed in or have `OP_SERVICE_ACCOUNT_TOKEN` set.

> [!IMPORTANT]
> The caller must open outbound SSH on port 22.
> Claude Code and Codex cloud sessions, and other sessions behind an HTTP-only proxy, cannot.
> Those sessions start the repository's CI workflow, and the workflow job runs `orly burst`.

### Trust on first use

A fresh machine's host key is unknown before its first connection.
orly accepts that first key into the run's own `known_hosts` file, never the user's, and later connections must match it.
Someone who can intercept the very first connection could stand in for the machine, so lanes run on networks the caller trusts.

### One-time setup for AWS Spot

The account owner creates one Identity and Access Management (IAM) policy for whoever launches runs, and a monthly AWS Budgets alert.
No instance role, bucket or stored secret is needed.
The policy lets the launcher create and remove only resources tagged `owner=agent`:

```json
{"Version": "2012-10-17", "Statement": [
  {"Effect": "Allow", "Action": "ec2:RunInstances", "Resource": "arn:aws:ec2:*:*:instance/*",
   "Condition": {"StringEquals": {"aws:RequestTag/owner": "agent"}}},
  {"Effect": "Allow", "Action": "ec2:RunInstances", "NotResource": "arn:aws:ec2:*:*:instance/*"},
  {"Effect": "Allow", "Action": ["ec2:ImportKeyPair", "ec2:CreateSecurityGroup"], "Resource": "*",
   "Condition": {"StringEquals": {"aws:RequestTag/owner": "agent"}}},
  {"Effect": "Allow", "Action": "ec2:CreateTags", "Resource": "*",
   "Condition": {"StringEquals": {"ec2:CreateAction": ["RunInstances", "ImportKeyPair", "CreateSecurityGroup", "CreateImage"]}}},
  {"Effect": "Allow", "Action": ["ec2:TerminateInstances", "ec2:StopInstances", "ec2:AuthorizeSecurityGroupIngress",
   "ec2:DeleteSecurityGroup", "ec2:DeleteKeyPair", "ec2:DeregisterImage", "ec2:DeleteSnapshot"], "Resource": "*",
   "Condition": {"StringEquals": {"aws:ResourceTag/owner": "agent"}}},
  {"Effect": "Allow", "Action": "ec2:CreateImage", "Resource": "arn:aws:ec2:*:*:instance/*",
   "Condition": {"StringEquals": {"aws:ResourceTag/owner": "agent"}}},
  {"Effect": "Allow", "Action": "ec2:CreateImage", "Resource": ["arn:aws:ec2:*::image/*", "arn:aws:ec2:*::snapshot/*"],
   "Condition": {"StringEquals": {"aws:RequestTag/owner": "agent"}}},
  {"Effect": "Allow", "Action": ["ec2:DescribeInstances", "ec2:DescribeImages", "ec2:DescribeSubnets",
   "ec2:DescribeSpotPriceHistory", "ec2:DescribeSecurityGroups", "ec2:DescribeKeyPairs"], "Resource": "*"},
  {"Effect": "Allow", "Action": "ssm:GetParameters", "Resource": "arn:aws:ssm:*::parameter/aws/service/debian/*"}
]}
```

The caller's `aws` command-line tool supplies the credentials, from a profile or the `AWS_*` variables.
A CI job gets them from its own cloud login step.

### One-time setup for E2E Networks

1. In MyAccount, open **Products → API → Create New Token**.
2. Copy the API key and the auth token into the caller's secret store.
3. Note the project ID from MyAccount.

orly reads them from `E2E_API_KEY`, `E2E_AUTH_TOKEN` and `E2E_PROJECT_ID` only.
The project's default security group allows all traffic, which includes inbound SSH.
A node gets the run's public key at creation; no key is registered on the account.

| Operation | MyAccount API call |
|---|---|
| Plans for the location | [`GET /images/`](https://docs.e2enetworks.com/api/myaccount/operations/os-plans/) |
| Create a node | [`POST /nodes/`](https://docs.e2enetworks.com/api/myaccount/compute/nodes/create-node/) |
| Read a node's state and address | [`GET /nodes/{node_id}/`](https://docs.e2enetworks.com/api/myaccount/operations/get-node-details/) |
| Power off, then save an image | [`PUT /nodes/{node_id}/actions/`](https://docs.e2enetworks.com/api/myaccount/operations/node-action/) |
| Delete a node | [`DELETE /nodes/{node_id}/`](https://docs.e2enetworks.com/api/myaccount/operations/delete-node/) |
| List saved images | [`GET /images/saved-images/`](https://docs.e2enetworks.com/api/myaccount/operations/get-images-saved-images/) |
| Delete a saved image | [`DELETE /images/{image_id}/`](https://docs.e2enetworks.com/api/myaccount/operations/delete-images-image-id/) |

### Settings

| Variable | Effect | Default | Range |
|---|---|---|---|
| `ORLY_BURST_DEADLINE_MINUTES` | Minutes a run may take. The caller deletes the machine then, and the machine schedules its own shutdown for then. | 120 | above 0, at most 1440 |
| `ORLY_BURST_POLL_SECONDS` | Seconds between state checks while a machine boots or an image saves. | 30 | above 0, at most 600 |
| `ORLY_BURST_SNAPSHOT_KEEP` | Snapshots `--prune` keeps. | 2 | 1 to 20 |
| `ORLY_BURST_OUT` | Directory for each run's key, log and results. | the system temporary directory's `orly-burst` | any path |
| `ORLY_BURST_REGION` | AWS region. | `us-east-1` | an AWS region name |
| `ORLY_BURST_INSTANCE_TYPES` | x86 types tried in order until one has Spot capacity. | `c7i.4xlarge c7a.4xlarge c6i.4xlarge m7i.4xlarge` | any instance types |
| `ORLY_BURST_AWS_IMAGE` | An Amazon Machine Image (AMI) ID or `resolve:ssm:` parameter used instead of a snapshot. | none: the newest snapshot, then Debian 13 amd64 | none |
| `ORLY_BURST_SUBNET` | Subnet for the instances; the security group joins its network. | the default network | a subnet ID |
| `ORLY_BURST_AWS_USER` | Login user of the AWS image. | `admin`, Debian's | a user name |
| `ORLY_BURST_E2E_LOCATION` | E2E location. | `Delhi` | `Delhi`, `Chennai` |
| `ORLY_BURST_E2E_PLAN` | E2E plan name, resolved to the location's plan for the image. | `C3.32GB`, 16 vCPU and 32 GB | an E2E plan name |
| `ORLY_BURST_E2E_IMAGE` | A saved image name, or an OS image name, used instead of a snapshot. | none: the newest snapshot, then `Ubuntu-24.04-Distro` | none |
| `ORLY_BURST_E2E_USER` | Login user of the E2E image. | `root` | a user name |

The machine's own shutdown is a backstop for a caller that died, and what it saves differs by provider:

| Machine | At its scheduled shutdown | Still billed afterwards |
|---|---|---|
| AWS Spot lane | terminates | nothing |
| AWS on-demand snapshot warm-up | stops | its 80 GB disk, until deleted |
| E2E node | powers off | the node, until deleted |
| Any machine under `--keep` | no shutdown is scheduled | everything, until deleted |

### Costs

E2E runs use the owner's planning figures of November 16, 2026: ₹25 per run hour and ₹200 per stored snapshot each month.
Both exclude 18% Goods and Services Tax (GST), and E2E bills a started hour as a whole one.
AWS runs assume a warm run of 30 minutes at a Spot price of $0.30 per hour, which varies by type, region and hour.

| Runs per month, warm | E2E runs with GST | E2E storage, 2 snapshots with GST | E2E total | AWS runs | AWS storage, 2 snapshots | AWS total |
|---|---|---|---|---|---|---|
| 10 | ₹295.00 | ₹472.00 | ₹767.00 | $1.50 | $8.00 at most | $9.50 |
| 50 | ₹1,475.00 | ₹472.00 | ₹1,947.00 | $7.50 | $8.00 at most | $15.50 |
| 200 | ₹5,900.00 | ₹472.00 | ₹6,372.00 | $30.00 | $8.00 at most | $38.00 |

AWS storage is $0.05 per GB each month for the Elastic Block Store (EBS) data an AMI keeps, at most its 80 GB volume.
Each snapshot capture costs one more run, and AWS adds about $0.005 per hour for each public IPv4 address.

## Steps

1. List the declared lanes:

   ```bash
   orly burst
   ```

   ```text
   orly burst: declared lanes: acceptance, integration
   usage: orly burst <lane>... --provider aws-spot|e2e|here [--ref <ref>] [--keep] [--no-snapshot]
   ```

   The command exits 2 when it names no lane.

2. Capture a warm snapshot of the repository:

   ```bash
   orly burst snapshot --provider e2e
   ```

   ```text
   orly burst: snapshot provider=e2e id=<IMAGE_ID> name=orly-burst-<REPO>-<UTC_MINUTE> size=<varies>GB storage≈₹200/month + GST
   ```

   The capture machine starts from the base image and runs setup and warm with no secret.
   It then stops, becomes an image named for the repository and the minute, and is deleted.

3. Run the lanes:

   ```bash
   orly burst acceptance integration --provider e2e
   ```

   ```text
   [acceptance] == make acceptance SUITE=all
   <varies>
   orly burst: lane=acceptance provider=e2e machine=C3.32GB minutes=<varies> cost≈₹25/h + GST (billed hourly) exit=0 evidence=<DIRECTORY>
   orly burst: lane=integration provider=e2e machine=C3.32GB minutes=<varies> cost≈₹25/h + GST (billed hourly) exit=0 evidence=<DIRECTORY>
   orly burst: total provider=e2e lanes=2 passed=2 failed=0 minutes=<varies>
   ```

   Each lane starts from the newest snapshot, fetches the ref into the warm checkout, runs setup again, then runs the lane.
   `--no-snapshot` starts from the base image instead, and `--ref <BRANCH>` runs a ref other than the current branch.

4. Keep the two newest snapshots and delete the rest.
   **Pruning deletes the older snapshots permanently, and no dry run exists.**

   ```bash
   orly burst snapshot --prune --provider e2e
   ```

   ```text
   orly burst: deleted snapshot orly-burst-<REPO>-<UTC_MINUTE> (<IMAGE_ID>)
   orly burst: e2e keeps 2 snapshot(s) of <REPO>
   ```

The same steps work with `--provider aws-spot`.
On AWS a snapshot is an AMI with its EBS snapshots, tagged `orly-burst=<REPO>`.
`<REPO>` is the origin remote's owner and name, such as `agentsfleet-orly`.

A volume made from an EBS snapshot loads each block on its first read.
The first reads of a warm cache are therefore slower than reads from a stopped disk.

### Run a lane from a CI job

A cloud agent session that cannot open SSH starts a workflow like this one, and the job launches the run:

```yaml
name: burst
on:
  workflow_dispatch:
    inputs:
      provider: {type: choice, options: [e2e, aws-spot], default: e2e}
      lane: {type: string, required: true}
jobs:
  burst:
    runs-on: ubuntu-latest
    timeout-minutes: 150
    permissions: {contents: read, id-token: write}
    steps:
      - uses: actions/checkout@v4
        with: {fetch-depth: 0}
      - uses: oven-sh/setup-bun@v2
        with: {bun-version: "1.4.4"}
      - uses: 1password/load-secrets-action@v2
        with: {export-env: true}
        env:
          OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
          CLERK_SECRET_KEY: op://<VAULT>/clerk-dev/secret-key
      - if: inputs.provider == 'aws-spot'
        uses: aws-actions/configure-aws-credentials@v4
        with: {role-to-assume: "<LAUNCHER_ROLE_ARN>", aws-region: us-east-1}
      - run: bunx --bun @agentsfleet/orly@0.40.0 burst "$LANE" --provider "$PROVIDER" --ref "$GITHUB_REF_NAME"
        env:
          LANE: ${{ inputs.lane }}
          PROVIDER: ${{ inputs.provider }}
          E2E_API_KEY: ${{ secrets.E2E_API_KEY }}
          E2E_AUTH_TOKEN: ${{ secrets.E2E_AUTH_TOKEN }}
          E2E_PROJECT_ID: ${{ vars.E2E_PROJECT_ID }}
```

`<LAUNCHER_ROLE_ARN>` is a role that carries the AWS launcher policy and trusts the repository's GitHub identity.
The secret loader exports each secret, so orly sends it to the machine without calling `op`.
A full clone matters, because a shallow clone cannot be bundled.

A job that should run the lane on the runner itself uses `--provider here` in the last step instead.
orly never starts a workflow run, so it never has to find one among older or concurrent runs.

### Try an unreleased orly

The cloud machines need no orly, so a local checkout launches runs directly:

```bash
~/Projects/orly/bin/orly burst acceptance --provider e2e
```

```text
<the same output as a released orly>
```

Run it from inside the repository whose lanes it should run.

## Verify it works

Each lane ends with one line in the same shape for every provider:

```text
orly burst: lane=<LANE> provider=<PROVIDER> machine=<TYPE_OR_PLAN> minutes=<N> cost≈<RATE> exit=<CODE> evidence=<DIRECTORY>
```

Only a number after `exit=` is evidence about the code.
`interrupted`, `deadline`, `cancelled`, `unlaunched` and `not_run` mean the lane never finished.
The command exits with the first failing lane's code, or 1 when no failing lane has one.

For a cloud lane, the evidence directory holds `run.log` and the declared results that existed on the machine.
For `--provider here`, the evidence is the checkout itself, and the log is the command's own output.

Setup and warm run without `burst.secrets`, `OP_SERVICE_ACCOUNT_TOKEN` or the AWS and E2E credentials orly reads.
A cloud lane gets only its declared secrets; a lane under `here` also keeps the rest of the caller's environment.

## Common problems

- **`set E2E_AUTH_TOKEN for this provider`**: the variable is missing or empty. Export it and run again.
- **`could not read the secret for <NAME>`**: `op` is not signed in, or the reference is wrong. Export the variable, or fix `op` and the reference.
- **The lane waits for SSH until the deadline**: port 22 is blocked between the caller and the machine. Run the lane from a CI job instead.
- **`exit=interrupted` on AWS**: AWS took the Spot instance back, or the session dropped. Run the lane again.
- **`run-instances refused`**: the launcher policy lacks a permission. The message names the operation AWS refused.
- **`E2E may have created node <NAME>`**: the create request failed after reaching E2E. Delete that node in MyAccount, where its label is `orly-burst`.

## Remove or undo

Without `--keep`, a run deletes its machines, key pair and security group, and its private key, even when a lane fails.
Ctrl-C or SIGTERM starts the same cleanup before orly exits.
A CI runner that kills orly before the cleanup ends leaves the resources behind.

`--keep` leaves the machines running for inspection, with no scheduled shutdown, and prints the key to log in with.
They bill until someone deletes them: the instance and its `orly-burst-<RUN>` key pair and group on AWS, or the node in MyAccount on E2E.
A run that died without cleaning up leaves resources tagged or labelled `orly-burst`, which are safe to delete.

**Deleting a snapshot is permanent; the next run starts cold from the base image.**
`orly burst snapshot --prune --provider <PROVIDER>` deletes all but the newest snapshots.

## Related pages

- [Architecture](ORLY_ARCHITECTURE.md) explains why the gates never run burst lanes.
- The `orly-burst` skill tells an agent when to run a lane and how to report it.
