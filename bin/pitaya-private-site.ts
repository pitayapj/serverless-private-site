#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';

import { resolveConfig } from '../lib/parameters/env-config';
import { CdkPipelineStack } from '../lib/stacks/cdk-pipeline';

const app = new App();

const config = resolveConfig();

const infraStatus = app.node.tryGetContext("infraStatus") != undefined ? app.node.tryGetContext("infraStatus") : "on"; 
if (infraStatus !== "on" && infraStatus !== "off") 
  throw new Error('Invalid infra status. Only accept on or off');

const cdkPipelineStack = new CdkPipelineStack(app, 'CDKPipelineStack', {
  env: { account: config.awsAccount, region: config.region },
  infraStatus: infraStatus,
});
