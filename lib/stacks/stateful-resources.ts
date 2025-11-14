/**
 * StateFULL resources
 * Databases!
 */

import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { commonConstants, DeployEnvEnum } from '../parameters';


interface StatefulResourceProps extends StackProps {
  deployEnv: DeployEnvEnum,
  vpc: ec2.Vpc;
}

export class StatefulResourceStack extends Stack {
  constructor(scope: Construct, id: string, props: StatefulResourceProps) {
    super(scope, id, props);
    const { deployEnv, vpc } = props;

  }
}
