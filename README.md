# CDK Template

Pitaya CDK template 😃 (in Typescript)

## Tables of contents

- [Background](#background)
- [Requirements](#requirements)
- [Stacks structure](#stacks-structure)
- [Files structure](#files-structure-and-its-meaning)
- [Set up](#set-up)
- [cdk diff](#cdk-diff)
- [Future improvements](#future-improvements)
- [Others](#others)

## Background

I don't want to initiate a blank CDK project anymore. So this is what I created.

🚨 Wrapped everything inside CDK Pipeline, will be the default from now on.

## Requirements

Of course a PC (I'm using MacOS, so installation guide gonna be for MacOS)

1. AWS CLI

   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

2. npm
3. CDK Typescript
   ```sh
   npm -g install typescript
   ```
4. AWS Credential (I will use AWS SSO Account with --profile flag)

## Stacks structure

The template include 4 major stacks, and will be (should be deploy in exact sequent):

- CDK Pipeline
- Base Network
- Stateful Resources
- Stateless Resources

Optional stack:

- Non Production

`Non Production` is just an example stack. In this stack I created automation to shut down resources temporary outside business hour (not meant to use in production)

You can deploy Stateful or Stateless independently, but they will still be depended on BaseNetwork stack .<bR>
In other word, BaseNetwork will be created no matter which stack you create first.

You can extend to more subsequent stacks. But the less stacks the better.

## Stages

Stage can be consider a sub set of CDK project. A combination of stack(s) in a CDK application.

Each stage can have just one or multiple stacks, which will be define in each stage's file.

For our project, every environments have the same stack(s), so we can define just one single stage and multiply it for each environment.

Combination of stacks(stage) helps deployment easier. We can also deploy each stack independently (keep in mind that the specific stack still belong to a stage, and it has its own dependency)

## Files structure and its meaning

```sh
pitaya-cdk-template
├── assets
│   └── lambda-code.py #example lambda function's code
├── bin
│   └── pitaya-cdk-template.ts # entry point, stacks and stages will be loaded here
├── lib
│   ├── parameters #parameters for stacks
│   │   ├── constants.ts #constants through out project
│   │   └── env-config.ts #load parameter from .env files below
│   ├── stacks #stacks' definition folder
│   │   ├── base-network.ts #BaseNetwork Stack
│   │   ├── cdk-pipeline.ts #CDK Pipeline Stack
│   │   ├── non-production.ts #Non Production Stack
│   │   ├── stateful-resources.ts #Stateful Stack
│   │   └── stateless-resources.ts #Stateless Stack
│   └── stages #deployment stages folder
│       └── app-stage.ts #application stage
└── .env.example #example parameters for CDK app
```

## Set up

### Git clone and bootstrap cdk to your AWS account

```sh
# Clone project
git clone git@github.com:long2205/pitaya-cdk-template.git
```

- Register account ID, github connection and github repo name in `.env` file (you can create a copy from .env.example)
- Also create a Secure String SSM parameter store named `/cdk/env`. Copy value from `.env` file to it.

```sh
# Bootstrap to your AWS
cdk bootstrap --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦
```

### Deploy everything! (although production need manual confirmation before deploy)

Since CDK Pipeline is wrapping around the whole infrastructure. Deploy everything for every environment with a single command:

```sh
cdk deploy CDKPipelineStack --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦
```

**⚠️⚠️⚠️Please also keep in mind that this stack will be deploy in Tokyo Region as default⚠️⚠️⚠️**<br>
Set different region in .env file if needed to.

A visualization of stack order for one stage and its dependency:

![stacks](/stacks.png)

## cdk diff

We can still compare, check different of stacks before deployment:

```sh
# Ex
# Check different in every stacks of Development stage
cdk diff "CDKPipelineStack/cdk-pipeline-dev/**" --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦

# Check different in Base Network stack of Staging stage
cdk diff "CDKPipelineStack/cdk-pipeline-stg/base-network" --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦

# Check different in Stateless stack of Production stage
cdk diff "CDKPipelineStack/cdk-pipeline-prod/stateless-resources" --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦
```

## Future improvements

Create a website so you can check `cdk diff` before accept deployments.

## Others

Update aws-cdk, its lib, others packages like dotenv and typescript.

Check outdated packages:

```sh
npm outdated
```

Install latest:

```sh
npx ncu -u
rm package-lock.json
rm -Rf ./node_modules
npm install
```
