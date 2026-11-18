---
type: how-to
audience: operator
verified: 2026-11-16
product_version: 0.42.0
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
    "artifacts": ["ui/packages/app/playwright-acceptance-results", "ui/packages/app/playwright-acceptance-report"],
    "directories": ["ACCEPTANCE_LOCAL_TOOLBOX_DIR"]
  }
}
```

Replace `<VAULT>` with the 1Password vault that holds the items.
An `agentsfleet` setup installs `lsof` for its readiness checks, then its own toolchains.

The caller sets `ACCEPTANCE_LOCAL_TOOLBOX_DIR` to a signed toolbox it downloaded, for example with `gh run download`.
orly sends that directory to each lane's machine; nothing is stored in the cloud.

| Field | Effect | Default |
|---|---|---|
| `burst.<name>` command | One lane. A name has 1 to 24 lowercase letters, digits or hyphens. | none |
| `burst.setup` | Runs before every lane and every snapshot warm-up, with no secret. Keep it idempotent and fast on a warm machine. | none |
| `burst.warm` | Runs after setup when a snapshot is captured, with no secret, to fill build caches. | none |
| `burst.secrets` | Environment variable name to an `op://` reference, read on the caller. | none |
| `burst.artifacts` | Paths below the checkout to bring back. A missing path is skipped. | none |
| `burst.directories` | Variables that each name a directory on the caller. orly copies each one to the machine over SSH and points the variable at the copy, for lanes only. | none |

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

An AWS run with `ORLY_BURST_AWS_ACCESS=ssm` needs only outbound HTTPS on port 443, so those sessions can run it directly.

### Trust on first use

A fresh machine's host key is unknown before its first connection.
orly accepts that first key into the run's own `known_hosts` file, never the user's, and later connections must match it.
Someone who can intercept the very first connection could stand in for the machine, so lanes run on networks the caller trusts.

### One-time setup for AWS Spot

The account owner creates one Identity and Access Management (IAM) policy for whoever launches runs, and a monthly AWS Budgets alert.
No instance role, bucket or stored secret is needed.

An account's first Spot launch needs the Spot service-linked role, and the launcher may not create IAM roles.
The account owner creates it once, with an administrator profile:

```bash
aws iam create-service-linked-role --aws-service-name spot.amazonaws.com
```

```text
<varies: the new role, or an error that it already exists>
```

The policy lets the launcher create and remove only resources tagged `owner=agent`:

```json
{"Version": "2012-10-17", "Statement": [
  {"Effect": "Allow", "Action": "ec2:RunInstances", "Resource": "arn:aws:ec2:*:*:instance/*",
   "Condition": {"StringEquals": {"aws:RequestTag/owner": "agent"}}},
  {"Effect": "Allow", "Action": "ec2:RunInstances", "NotResource": "arn:aws:ec2:*:*:instance/*"},
  {"Effect": "Allow", "Action": ["ec2:ImportKeyPair", "ec2:CreateSecurityGroup"], "Resource": ["arn:aws:ec2:*:*:key-pair/*", "arn:aws:ec2:*:*:security-group/*"],
   "Condition": {"StringEquals": {"aws:RequestTag/owner": "agent"}}},
  {"Effect": "Allow", "Action": "ec2:CreateSecurityGroup", "Resource": "arn:aws:ec2:*:*:vpc/*"},
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

### Reach AWS machines through Systems Manager

By default a run's security group admits SSH from the caller's address alone, so a caller whose address changes loses its lanes.
With `ORLY_BURST_AWS_ACCESS=ssm`, the group admits nothing, and SSH travels inside an AWS Systems Manager session to the instance.

The account owner creates the machines' role and instance profile once:

```bash
aws iam create-role --role-name orly-burst-ssm --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name orly-burst-ssm --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam create-instance-profile --instance-profile-name orly-burst-ssm
aws iam add-role-to-instance-profile --instance-profile-name orly-burst-ssm --role-name orly-burst-ssm
```

The launcher policy gains four statements: pass that role to EC2, and open and close sessions only on `owner=agent` instances.

```json
  {"Effect": "Allow", "Action": "iam:PassRole", "Resource": "arn:aws:iam::*:role/orly-burst-ssm",
   "Condition": {"StringEquals": {"iam:PassedToService": "ec2.amazonaws.com"}}},
  {"Effect": "Allow", "Action": "ssm:StartSession", "Resource": "arn:aws:ec2:*:*:instance/*",
   "Condition": {"StringEquals": {"ssm:resourceTag/owner": "agent"}}},
  {"Effect": "Allow", "Action": "ssm:StartSession", "Resource": "arn:aws:ssm:*::document/AWS-StartSSHSession"},
  {"Effect": "Allow", "Action": "ssm:TerminateSession", "Resource": "arn:aws:ssm:*:*:session/${aws:username}-*"}
```

The caller installs AWS's Session Manager plugin, for example with `brew install --cask session-manager-plugin`, and sets `ORLY_BURST_AWS_INSTANCE_PROFILE=orly-burst-ssm`.
Debian's image carries no Systems Manager agent, so each machine's first boot installs it from AWS's regional bucket.
A snapshot captured this way already runs the agent, and its lanes skip the download.

### One-time setup for E2E Networks

The `e2e` provider runs TIR virtual machines: whole Linux machines with their own kernel, reached as root over SSH.

1. In TIR, create an API token for the project the runs bill to.
2. Copy its API key, its auth token and the TIR project ID into the caller's secret store.

orly reads them from `E2E_API_KEY`, `E2E_AUTH_TOKEN` and `E2E_PROJECT_ID` only; MyAccount keys do not work here.
TIR admits only a public key already saved in the account, so each run saves its key as `orly-burst-<RUN>` and deletes it after.

Each run also creates a security group `orly-burst-<RUN>` that admits TCP 22 from the caller's public IPv4 address only, as on AWS.
Once the run's VMs are gone, orly deletes the group, retrying for up to 5 minutes.
Unverified: whether TIR lets a VM reach the internet when its group declares no outbound rule.

| Operation | TIR API call, under `https://api.e2enetworks.com/myaccount/api/v1/gpu` |
|---|---|
| Hourly CPU plans | `GET /gpu_service/sku/?service=notebook` |
| OS images | `GET /gpu_service/image/?category=notebook` |
| Save and delete the run's key | `POST /ssh_keys/`, `GET /ssh_keys/`, `DELETE /ssh_keys/{pk}/` |
| Create and delete the run's SSH group | `POST /security_groups/`, `DELETE /security_groups/{id}/rules/` |
| Create a VM | [`POST /notebooks/` with `kind: "vm"`](https://docs.e2enetworks.com/api/tir/compute/instancevm/post-notebooks/) |
| Read a VM's state and address, then delete it | `GET /notebooks/{id}/`, `DELETE /notebooks/{id}/` |
| Stop a VM, then snapshot it | `PUT /notebooks/{id}/actions/?action=Stop`, `POST /notebooks/{id}/snapshots/` |
| List and delete snapshots | `GET /notebooks/vm/snapshots/`, `DELETE /notebooks/vm/snapshots/{id}/` |

Every call carries `apikey`, `location` and, outside `/ssh_keys/`, `project_id` in its query, and the token as `Authorization: Bearer`.
The [TIR API reference](https://docs.e2enetworks.com/api/tir/) documents each operation.
unverified: whether a TIR VM runs privileged Docker containers; the [virtual machine guide](https://docs.e2enetworks.com/docs/tir/VirtualMachines/virtual-machines/) does not say.

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
| `ORLY_BURST_MARKET` | How AWS lanes are rented. `spot-then-on-demand` runs a lane AWS took back once more on demand. | `spot` | `spot`, `on-demand`, `spot-then-on-demand` |
| `ORLY_BURST_AWS_ACCESS` | How the caller reaches AWS machines: SSH from its address, or SSH inside a Systems Manager session. | `ssh` | `ssh`, `ssm` |
| `ORLY_BURST_AWS_INSTANCE_PROFILE` | The instance profile AWS machines sign in to Systems Manager with; required by `ssm`. | none | an instance profile name |
| `ORLY_BURST_E2E_LOCATION` | TIR location. | `Delhi` | `Delhi`, `Chennai` |
| `ORLY_BURST_E2E_PLAN` | TIR CPU plan name; orly uses its hourly price. | `C3.32GB`, 16 vCPU and 32 GB, listed at ₹18.6 an hour at Delhi on 2026-11-16 | a TIR CPU plan name |
| `ORLY_BURST_E2E_IMAGE` | A snapshot name, or an OS image as `<name> <version>`, used instead of a snapshot. A snapshot capture warms from it too. | none: the newest snapshot, then `Debian 13` | none |
| `ORLY_BURST_E2E_USER` | Login user of the E2E image. | `root` | a user name |

The machine's own shutdown is a backstop for a caller that died, and what it saves differs by provider:

| Machine | At its scheduled shutdown | Still billed afterwards |
|---|---|---|
| AWS lane, Spot or on demand | terminates | nothing |
| AWS on-demand snapshot warm-up | stops | its 80 GB disk, until deleted |
| E2E TIR VM | stops | its disk keeps its files; unverified: what a stopped VM bills |
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

An on-demand lane costs about ten times its Spot price.
In `ap-south-2` on November 17, 2026, `c6a.4xlarge` cost $0.374 an hour on demand and $0.037 to $0.058 on Spot.

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
   orly burst: snapshot provider=e2e id=<IMAGE_ID> name=orly-burst-<REPO>-<UTC_MILLISECOND>-<RANDOM> state=ready size=<varies>GB storage≈₹200/month + GST
   ```

   The capture machine starts from the base image and runs setup and warm with no secret.
   It then stops, becomes an image named for the repository, millisecond timestamp and random suffix, and is deleted.

   Saving a large image can outlast the run's deadline.
   orly then prints `state=pending` and exits 0, because the cloud goes on saving the image after the machine is deleted.
   Lanes and `--prune` use the image once the cloud marks it ready; a failed image fails the capture with the cloud's reason.

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
   orly burst: deleted snapshot orly-burst-<REPO>-<UTC_MILLISECOND>-<RANDOM> (<IMAGE_ID>)
   orly burst: e2e keeps 2 snapshot(s) of <REPO>
   ```

The same steps work with `--provider aws-spot`.
On AWS a snapshot is an AMI with its EBS snapshots, tagged `orly-burst=<REPO>`.

`<REPO>` is a 24-character hexadecimal digest of the repository identity.
The timestamp has 17 digits; the random suffix has eight hexadecimal characters.

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
      - run: bunx --bun @agentsfleet/orly@0.42.0 burst "$LANE" --provider "$PROVIDER" --ref "$GITHUB_REF_NAME"
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
- **`this machine's address changed from <A> to <B>`**: the caller changed network after launch, and the run admits SSH from `<A>` only. Run the lane again from the new network.
- **`the deadline passed while waiting for SSH`**: port 22 is blocked between the caller and the machine. The wait ends after 10 minutes with ssh's own error. Run the lane from a CI job instead.
- **`exit=interrupted` on AWS**: AWS took the Spot instance back, or the session dropped. Run the lane again, or set `ORLY_BURST_MARKET=spot-then-on-demand` and `ORLY_BURST_AWS_ACCESS=ssm`.
- **The same message under `ssm`**: the machine's agent never reached Systems Manager. Check the instance profile's role carries `AmazonSSMManagedInstanceCore`.
- **`run-instances refused`**: the launcher policy lacks a permission. The message names the operation AWS refused.
- **`TIR may have created VM <NAME>`**: the create request failed after reaching TIR. Delete that VM in TIR, where its name starts `orly-burst-`.
- **`Access Denied Read..` from E2E**: the keys belong to MyAccount, not TIR. Create a TIR API token for the project and store it instead.

## Remove or undo

Without `--keep`, a run deletes its machines, key pair and security group, and its private key, even when a lane fails.
Ctrl-C or SIGTERM starts the same cleanup before orly exits.
A CI runner that kills orly before the cleanup ends leaves the resources behind.

`--keep` leaves the machines running for inspection, with no scheduled shutdown, and prints the key to log in with.
They bill until someone deletes them.

On AWS that is the instance with its `orly-burst-<RUN>` key pair and group; in TIR, the VM with its saved key and group.
A run that died without cleaning up leaves resources tagged or labelled `orly-burst`, which are safe to delete.

**Deleting a snapshot is permanent; the next run starts cold from the base image.**
`orly burst snapshot --prune --provider <PROVIDER>` deletes all but the newest snapshots.

## Related pages

- [Architecture](ORLY_ARCHITECTURE.md) explains why the gates never run burst lanes.
- The `orly-burst` skill tells an agent when to run a lane and how to report it.

## Snapshot ownership in 0.50.0

Snapshot names use a digest of the origin host, full repository path and any home-relative SSH account.
Absolute paths retain ownership across transports; home-relative paths keep their account namespace. Repositories without an origin use their shared Git directory identity.

A home-relative SSH origin must name its account, such as `alice@host:repo.git`. Orly refuses an omitted account because local SSH settings can select different owners.

Snapshots named by older versions are neither selected nor pruned automatically. Inspect those resources before deleting them in the provider console; their shortened names cannot prove ownership.

Cancellation stops new mutations and cancels reads. In-flight mutations retain bounded replies so cleanup can identify their resources.
Cleanup runs independently and reports resources that still need manual deletion.
