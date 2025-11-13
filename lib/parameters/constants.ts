/**
 * This file contain parameters to deploy to each environments.
 * Or a common constants to use in the project as a whole.
 * CDK application will uses this parameters to reference resources created outside of the app, or a customize parameter belong to your own project.
 * For ex: Common Codestar Connections to Github (which has to make manually), or a domain name, which will be difference for each project.
 */

export const commonConstants = {
	project: "template",
}

export enum DeployEnvEnum {
  DEV = 'dev',
  STG = 'stg',
  PROD = 'prod',
}

export const envConstants = {
	[DeployEnvEnum.DEV]: {
			cidr: "10.0.0.0/16",
			domain: "dev.template.com",
			apiDomain: "api.dev.template.com",
			codeBranch: "develop"
	},
	[DeployEnvEnum.STG]: {
			cidr: "10.1.0.0/16",
			domain: "stg.template.com",
			apiDomain: "api.stg.template.com",
			codeBranch: "staging"
	},
	[DeployEnvEnum.PROD]: {
			cidr: "10.2.0.0/16",
			domain: "template.com",
			apiDomain: "api.template.com",
			codeBranch: "main"
	}
}