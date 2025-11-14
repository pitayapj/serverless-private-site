/**
 * A stage is a composition of stack(s).
 * In this file dev.ts I am declaring everything that will be use in Development environment.
 * We can multiply this file to create stg.ts, prod.ts and each can have its own prefer stack(s).
 * For ex: only dev.ts and stg.ts will have non-production stack.
 */

import {
	Stage,
	StageProps,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DeployEnvEnum } from '../parameters/constants';
//Import stack(s)
import { BaseNetworkStack } from '../stacks/base-network';
// import { StatefulResourceStack } from '../stacks/stateful-resources';
import { StatelessResourceStack } from '../stacks/stateless-resources';
// import { NonProductionStack } from '../stacks/non-production';

interface AppStageProps extends StageProps {
	deployEnv: DeployEnvEnum,
	infraStatus: "on" | "off",
}

export class AppStage extends Stage {
	constructor(scope: Construct, id: string, props: AppStageProps) {
		super(scope, id, props)

		//Stage prefix
		const { deployEnv } = props;

		/**
		 * First, the base network stack
		 * Base network included VPC and its config.
		 * VPC properties could be changed, but not the VPC itself,
		 * VPC itself should not be delete and should be available till the end of project life cycle.
		 * Should be things that's free
		 *  */
		const baseNetworkStack = new BaseNetworkStack(this, 'base-network', {
			deployEnv: deployEnv,
			terminationProtection: deployEnv == "prod" ? true : false,
		});

		/**
		 * The stateFUL stack
		 * Stateful stack should be things that will retain data.
		 * Most of the time should just be AWS RDS databases 
		 * With this private app, you could declare DynamoDb
		 * Delete protection should be on for production and off otherwise.
		 *  */
		// const statefulResourceStack = new StatefulResourceStack(this, 'stateful-resources', {
		// 	deployEnv: deployEnv,
		// 	vpc: baseNetworkStack.vpc, //reference resource from difference stack can make stack interlock, so be careful!
		// 	terminationProtection: deployEnv == "prod" ? true : false,
		// });
		// statefulResourceStack.addDependency(baseNetworkStack);


		/**
		 * The stateLESS stack
		 * Stateless resources is something can be deleted/recreate without affecting the project's data.
		 * According to AWS Best practice of CDK, you should put every resources into 1 file/stack.
		 * https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html
		 * This stack should included everything else other than VPC and stateful resources.
		 * Load Balancer, EC2, ECS, Lambda, Code Pipeline, etc..
		 * If you have too many lambda functions, you can write in into a difference file.
		 *  */
		const statelessResourceStack = new StatelessResourceStack(this, 'stateless-resources', {
			deployEnv: deployEnv,
			// vpc: baseNetworkStack.vpc,
			hostZone: baseNetworkStack.hostZone,
			terminationProtection: deployEnv == "prod" ? true : false,
		});
		statelessResourceStack.addDependency(baseNetworkStack);

		/**
		 * The NON Production stack
		 * Why would you want this ?
		 * You might not want to waste your resources in dev or stg environment, when you are not using it. 
		 * So this stack will turn off your computing resources and databases when you are out of the office.
		 * This stack code will be commented, because not everyone need it
		 * This stack will be depended on stateless and stateful stacks so when you need to delete stacks, delete this first.
		 */
		// const nonProductionStack = new NonProductionStack(this, 'NonProduction', {
		//   deployEnv: deployEnv,
		//   cluster: statelessResourceStack.cluster,
		//   backendService: statelessResourceStack.backendService,
		//   database: statefulResourceStack.database
		// });
		// nonProductionStack.addDependency(statelessResourceStack);
		// nonProductionStack.addDependency(statefulResourceStack);
	}
}