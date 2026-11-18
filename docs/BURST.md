---
type: how-to
audience: operator
verified: 2026-11-18
product_version: 0.60.0
executable: false
---

# Run burst lanes on a rented machine

## What this does

`orly burst` runs a repository's slow lanes, such as acceptance tests, on machines rented for the run.
Amazon Web Services (AWS) Spot and E2E Networks start one machine per lane, in parallel, and delete each one when its lane ends.

The gates never run `burst.*` commands, because every cloud run costs money.

```text
caller                                         rented machine
  1. read burst.secrets (environment or op)
  2. bundle the ref with git
  3. create the machine ------- cloud API ---> boots the newest snapshot
  4. ssh: the commits it lacks  SSH ---------> /tmp/orly-burst.bundle
  5. ssh: bash -s ------------- SSH ---------> setup, then secrets, then lane
     [lane] log lines <-------- SSH ---------- standard output and errors
  6. ssh: tar of results <----- SSH ---------- burst.artifacts that exist
  7. delete the machine, the key and the security group
```

One transport serves both clouds: Secure Shell (SSH) with a key pair made for the run.
Nothing is staged in object storage, and no secret is stored in the cloud.

## Before you begin

Declare the lanes as `burst.<name>` commands, and the `burst` object beside them in `.orly/orly.json`:

```json
{
  "commands": {
    "burst.acceptance": [["make", "acceptance", "SUITE=all"]],
    "burst.integration": [["make", "test-integration-rustd"]]
  },
  "burst": {
    "setup": [["apt-get", "install", "-y", "-qq", "lsof"], ["make", "deps"]],
    "warm": [["make", "build-all"]],
    "secrets": {"CLERK_SECRET_KEY": "op://<VAULT>/clerk-dev/secret-key"},
    "artifacts": ["ui/packages/app/playwright-acceptance-report"],
    "directories": ["ACCEPTANCE_LOCAL_TOOLBOX_DIR"],
    "e2e": {"location": "Chennai", "plan": "C3.32GB", "image": "Debian 13"},
    "aws": {"region": "ap-south-1", "instance_types": ["c7i.4xlarge"]}
  }
}
```

| Field | Effect | Default |
|---|---|---|
| `burst.<name>` command | One lane. A name has 1 to 24 lowercase letters, digits or hyphens. | none |
| `burst.setup` | Runs as root before every lane and snapshot warm-up, with no secret. Keep it fast on a warm machine. | none |
| `burst.warm` | Runs after setup when a snapshot is captured, with no secret, to fill build caches. | none |
| `burst.secrets` | Environment variable name to an `op://` reference, read on the caller. | none |
| `burst.artifacts` | Paths below the checkout that a lane brings back. A missing path is skipped. | none |
| `burst.directories` | Variables naming directories on the caller, copied to each lane's machine over SSH. | none |
| `burst.e2e.location` | TIR location. | `Delhi` |
| `burst.e2e.plan` | TIR CPU plan; orly uses its hourly price. | `C3.32GB`, 16 vCPU and 32 GB |
| `burst.e2e.image` | OS image as `<name> <version>` that snapshots warm from and cold lanes boot. | `Debian 13` |
| `burst.aws.region` | AWS region. | `us-east-1` |
| `burst.aws.instance_types` | x86 types tried in order until one has capacity. | `c7i.4xlarge`, `c7a.4xlarge`, `c6i.4xlarge`, `m7i.4xlarge` |
| `burst.aws.image` | Amazon Machine Image (AMI) ID or `resolve:ssm:` parameter that snapshots warm from and cold lanes boot. | Debian 13 amd64 |
| `burst.aws.user`, `burst.e2e.user` | Login user of the image. | `admin` on AWS, `root` on E2E |

A lane starts from the repository's newest ready snapshot of the configured image; `--no-snapshot` starts it from the image itself.
orly reads this object from the ref it runs, so a branch carries its own placement.

Each machine installs Git, curl, unzip, Docker and Docker Compose on its first boot, and runs every lane with `CI=1`.
The caller needs `git`, `ssh`, `ssh-keygen`, `tar` and the provider's credentials below.
A secret already in the caller's environment is used as it is; any other is read with `op read`.

> [!IMPORTANT]
> The caller must open outbound SSH on port 22, and keep the same public address for the whole run.
> Sessions behind an HTTP-only proxy start the repository's Continuous Integration (CI) workflow instead, which runs `orly burst`.

orly accepts a fresh machine's host key on first connection, into the run's own `known_hosts` file only.
Run lanes from networks you trust, since someone intercepting that first connection could stand in for the machine.

### One-time setup for AWS Spot

The account owner creates the Spot service-linked role once, with an administrator profile:

```bash
aws iam create-service-linked-role --aws-service-name spot.amazonaws.com
```

```text
<varies: the new role, or an error that it already exists>
```

The launcher's policy creates and removes only resources tagged `owner=agent`:

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

orly calls Amazon Elastic Compute Cloud (EC2) through the AWS software development kit (SDK), which reads the same credentials as the `aws` tool. That means a profile, `AWS_PROFILE` or the `AWS_*` variables; a CI job gets them from its login step.
Add a monthly AWS Budgets alert as well.

### One-time setup for E2E Networks

The `e2e` provider runs TIR virtual machines, reached as root over SSH.

1. In TIR, create an API token for the project the runs bill to.
2. Store its API key, auth token and the project ID as `E2E_API_KEY`, `E2E_AUTH_TOKEN` and `E2E_PROJECT_ID`.

MyAccount keys do not work. Each run saves its public key and a security group named `orly-burst-<RUN>` in TIR, and deletes both after.

### Settings

These variables shape a run, not where it runs:

| Variable | Effect | Default |
|---|---|---|
| `ORLY_BURST_DEADLINE_MINUTES` | Minutes a run may take; the machine also schedules its own shutdown for then. At most 1440. | 120 |
| `ORLY_BURST_POLL_SECONDS` | Seconds between state checks while a machine boots or an image saves. At most 600. | 30 |
| `ORLY_BURST_OUT` | Directory for each run's log and results. | the system temporary directory's `orly-burst` |
| `ORLY_BURST_MARKET` | `spot` or `on-demand`, how AWS lanes are rented. | `spot` |

orly's own limits, which no setting changes:

| Wait | Limit |
|---|---|
| A machine booting, then answering SSH | 10 minutes each |
| One request to TIR or EC2 | 60 seconds |
| TIR retries of a busy answer (429, 5xx, timeout), creates excepted | 10, backing off up to `ORLY_BURST_POLL_SECONDS` |
| EC2 attempts of one call | 10 |
| E2E VM deletion, then security group deletion | 5 minutes each |
| AWS instance termination before the group is deleted | 15 minutes |

A machine's own shutdown is the backstop for a caller that died:

| Machine | At its scheduled shutdown | Still billed afterwards |
|---|---|---|
| AWS lane | terminates | nothing |
| AWS snapshot warm-up, on demand | stops | its 80 GB disk, until deleted |
| E2E TIR VM | stops | unverified: what a stopped VM bills |

### Costs

E2E uses the owner's planning figures of November 16, 2026: ₹25 per run hour and ₹200 per stored snapshot each month.
Both exclude 18% Goods and Services Tax (GST), and E2E bills a started hour as a whole one.
AWS assumes a 30-minute warm run at $0.30 an hour Spot, and $0.05 per GB each month for a snapshot's disk.

| Warm runs per month | E2E with GST, 2 snapshots | AWS, 2 snapshots |
|---|---|---|
| 10 | ₹767.00 | $9.50 |
| 50 | ₹1,947.00 | $15.50 |
| 200 | ₹6,372.00 | $38.00 |

A snapshot capture costs one more run, and an on-demand lane costs about ten times its Spot price.

## Steps

1. List the declared lanes; the command exits 2 when it names none:

   ```bash
   orly burst
   ```

   ```text
   orly burst: declared lanes: acceptance, integration
   usage: orly burst <lane>... --provider aws-spot|e2e [--ref <ref>] [--no-snapshot]
          orly burst snapshot [--prune] --provider aws-spot|e2e [--ref <ref>]
   ```

2. Capture a warm snapshot. The machine boots the image, runs setup and warm with no secret, and is saved, then deleted:

   ```bash
   orly burst snapshot --provider e2e
   ```

   ```text
   orly burst: snapshot provider=e2e id=<IMAGE_ID> name=orly-burst-<REPO>-<STAMP>-<RANDOM> state=ready size=<varies>GB storage≈₹200/month + GST
   ```

   An image still saving at the deadline prints `state=pending`; lanes use it once the cloud marks it ready.

3. Run the lanes. `--ref <BRANCH>` runs a ref other than the current branch:

   ```bash
   orly burst acceptance integration --provider e2e
   ```

   ```text
   orly burst: lane=acceptance provider=e2e machine=C3.32GB minutes=<varies> cost≈₹25/h + GST (billed hourly) exit=0 evidence=<DIRECTORY>
   orly burst: lane=integration provider=e2e machine=C3.32GB minutes=<varies> cost≈₹25/h + GST (billed hourly) exit=0 evidence=<DIRECTORY>
   orly burst: total provider=e2e lanes=2 passed=2 failed=0 minutes=<varies>
   ```

4. Keep the newest snapshot of the configured image. **Pruning deletes every other snapshot of the repository permanently, and no dry run exists.**

   ```bash
   orly burst snapshot --prune --provider e2e
   ```

   ```text
   orly burst: e2e keeps 1 snapshot(s) of <REPO>
   ```

The same steps work with `--provider aws-spot`, where a snapshot is an AMI tagged `orly-burst=<REPO>`.
A local orly checkout runs the same way: `~/Projects/orly/bin/orly burst acceptance --provider e2e`, from the repository.

### Run a lane from a CI job

A session that cannot open SSH starts a workflow like this one:

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
        with: {role-to-assume: "<LAUNCHER_ROLE_ARN>", aws-region: ap-south-1}
      - run: bunx --bun @agentsfleet/orly@0.60.0 burst "$LANE" --provider "$PROVIDER" --ref "$GITHUB_REF_NAME"
        env:
          LANE: ${{ inputs.lane }}
          PROVIDER: ${{ inputs.provider }}
          E2E_API_KEY: ${{ secrets.E2E_API_KEY }}
          E2E_AUTH_TOKEN: ${{ secrets.E2E_AUTH_TOKEN }}
          E2E_PROJECT_ID: ${{ vars.E2E_PROJECT_ID }}
```

`<LAUNCHER_ROLE_ARN>` carries the launcher policy and trusts the repository's GitHub identity.
A full clone matters, because a shallow clone cannot be bundled.

## Verify it works

Each lane ends with one line in the same shape for every provider:

```text
orly burst: lane=<LANE> provider=<PROVIDER> machine=<TYPE_OR_PLAN> minutes=<N> cost≈<RATE> exit=<CODE> evidence=<DIRECTORY>
```

Only a number after `exit=` is evidence about the code; `interrupted`, `deadline`, `cancelled`, `unlaunched` and `not_run` mean the lane never finished.
The evidence directory holds `run.log` and the declared results the machine had.
Setup and warm never see `burst.secrets` or the cloud credentials, and a cloud lane gets only its declared secrets.

## Common problems

- **`set E2E_AUTH_TOKEN for this provider`**: the variable is missing or empty. Export it and run again.
- **`orly burst no longer reads <VARIABLE>`**: placement moved to `.orly/orly.json`. Set the key the message names, and unset the variable.
- **`could not read the secret for <NAME>`**: `op` is not signed in, or the reference is wrong.
- **`this machine's address changed from <A> to <B>`**: the caller changed network after launch. Run the lane again from the new network.
- **`the deadline passed while waiting for SSH`**: port 22 is blocked between the caller and the machine. Run the lane from a CI job instead.
- **`exit=interrupted` on AWS**: AWS took the Spot instance back, or the session dropped. Run it again, or set `ORLY_BURST_MARKET=on-demand`.
- **`exit=not_run`**: the machine's preparation, the checkout or `burst.setup` failed before the lane started. The lane's `run.log` names the step.
- **`run-instances refused`**: the launcher policy lacks the permission the message names.
- **`Access Denied Read..` from E2E**: the keys belong to MyAccount. Create a TIR API token for the project instead.

## Remove or undo

A run deletes its machines, key, security group, bundle and private key, even when a lane fails, on Ctrl-C, SIGTERM or a closed terminal.
A VM whose create reply TIR lost is found by name and deleted too.
A process killed outright, such as by a CI runner, leaves them behind; they are tagged or labelled `orly-burst` and safe to delete.

**Deleting a snapshot is permanent**, and the next run starts cold from the image.
A snapshot's name ends in a digest of its base image, so changing `burst.e2e.image` or `burst.aws.image` starts lanes cold until the next capture.
Snapshots named by orly before 0.50.0 are never selected or pruned; inspect them in the provider console before deleting them.

## Related pages

- [Architecture](ORLY_ARCHITECTURE.md) explains why the gates never run burst lanes.
- The `orly-burst` skill tells an agent when to run a lane and how to report it.
