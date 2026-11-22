import type { ManagedPolicyStatement } from "./managed-policies.js";
/**
 * AWS管理ポリシーの内容です（spec proofgate-brushup, Step 7）。AWSのドキュメントのページから、Statementを1つずつ、そのまま写しました。
 * Allowの`Condition`は、写しません。`Condition`はAllowを狭めるだけなので、外すと指摘が増える側です（過大判定）。
 * 内容を変えるのは、写し直すときだけです。テストは、保存したドキュメント（tests/data/managed-policies）と比べます。
 * Contents of AWS managed policies, copied statement by statement from the AWS documentation pages. The Condition of an Allow
 * statement is not copied: it can only narrow the statement, so dropping it only adds findings (over-approximation).
 */
/**
 * AmazonSSMManagedInstanceCore: policy version v2, edited May 23, 2019, 16:54 UTC, ARN arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore.
 * 3 Allow statements; 0 had a Condition (not copied). Source: https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonSSMManagedInstanceCore.html (read 2026-11-22).
 */
export const AMAZONSSMMANAGEDINSTANCECORE: readonly ManagedPolicyStatement[] = [
  {
    actions: [
      "ssm:DescribeAssociation",
      "ssm:GetDeployablePatchSnapshotForInstance",
      "ssm:GetDocument",
      "ssm:DescribeDocument",
      "ssm:GetManifest",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:ListAssociations",
      "ssm:ListInstanceAssociations",
      "ssm:PutInventory",
      "ssm:PutComplianceItems",
      "ssm:PutConfigurePackageResult",
      "ssm:UpdateAssociationStatus",
      "ssm:UpdateInstanceAssociationStatus",
      "ssm:UpdateInstanceInformation",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "ec2messages:AcknowledgeMessage",
      "ec2messages:DeleteMessage",
      "ec2messages:FailMessage",
      "ec2messages:GetEndpoint",
      "ec2messages:GetMessages",
      "ec2messages:SendReply",
    ],
    resources: ["*"],
  },
];
/**
 * AWSGlueServiceRole: policy version v5, edited September 11, 2023, 16:39 UTC, ARN arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole.
 * 6 Allow statements; 1 had a Condition (not copied). Source: https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSGlueServiceRole.html (read 2026-11-22).
 */
export const AWSGLUESERVICEROLE: readonly ManagedPolicyStatement[] = [
  {
    actions: [
      "glue:*",
      "s3:GetBucketLocation",
      "s3:ListBucket",
      "s3:ListAllMyBuckets",
      "s3:GetBucketAcl",
      "ec2:DescribeVpcEndpoints",
      "ec2:DescribeRouteTables",
      "ec2:CreateNetworkInterface",
      "ec2:DeleteNetworkInterface",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSubnets",
      "ec2:DescribeVpcAttribute",
      "iam:ListRolePolicies",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "cloudwatch:PutMetricData",
    ],
    resources: ["*"],
  },
  { actions: ["s3:CreateBucket"], resources: ["arn:aws:s3:::aws-glue-*"] },
  {
    actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
    resources: ["arn:aws:s3:::aws-glue-*/*", "arn:aws:s3:::*/*aws-glue-*/*"],
  },
  {
    actions: ["s3:GetObject"],
    resources: ["arn:aws:s3:::crawler-public*", "arn:aws:s3:::aws-glue-*"],
  },
  {
    actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
    resources: ["arn:aws:logs:*:*:*:/aws-glue/*"],
  },
  {
    actions: ["ec2:CreateTags", "ec2:DeleteTags"],
    resources: [
      "arn:aws:ec2:*:*:network-interface/*",
      "arn:aws:ec2:*:*:security-group/*",
      "arn:aws:ec2:*:*:instance/*",
    ],
  },
];
/**
 * AWSBackupServiceRolePolicyForBackup: policy version v30, edited February 23, 2026, 19:42 UTC, ARN arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup.
 * 59 Allow statements; 10 had a Condition (not copied). Source: https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSBackupServiceRolePolicyForBackup.html (read 2026-11-22).
 */
export const AWSBACKUPSERVICEROLEPOLICYFORBACKUP: readonly ManagedPolicyStatement[] = [
  {
    actions: ["dynamodb:DescribeTable", "dynamodb:CreateBackup"],
    resources: ["arn:aws:dynamodb:*:*:table/*"],
  },
  {
    actions: ["dynamodb:DescribeBackup", "dynamodb:DeleteBackup"],
    resources: ["arn:aws:dynamodb:*:*:table/*/backup/*"],
  },
  {
    actions: [
      "rds:AddTagsToResource",
      "rds:ListTagsForResource",
      "rds:DescribeDBSnapshots",
      "rds:CreateDBSnapshot",
      "rds:CopyDBSnapshot",
      "rds:DescribeDBInstances",
      "rds:CreateDBClusterSnapshot",
      "rds:DescribeDBClusters",
      "rds:DescribeDBClusterSnapshots",
      "rds:CopyDBClusterSnapshot",
      "rds:DescribeDBClusterAutomatedBackups",
    ],
    resources: ["*"],
  },
  {
    actions: ["rds:DeleteDBInstanceAutomatedBackup"],
    resources: ["arn:aws:rds:*:*:auto-backup:*"],
  },
  { actions: ["rds:ModifyDBCluster"], resources: ["arn:aws:rds:*:*:cluster:*"] },
  {
    actions: ["rds:DeleteDBClusterAutomatedBackup"],
    resources: ["arn:aws:rds:*:*:cluster-auto-backup:*"],
  },
  { actions: ["rds:ModifyDBInstance"], resources: ["arn:aws:rds:*:*:db:*"] },
  {
    actions: ["rds:DeleteDBSnapshot", "rds:ModifyDBSnapshotAttribute"],
    resources: ["arn:aws:rds:*:*:snapshot:awsbackup:*"],
  },
  {
    actions: ["rds:DeleteDBClusterSnapshot", "rds:ModifyDBClusterSnapshotAttribute"],
    resources: ["arn:aws:rds:*:*:cluster-snapshot:awsbackup:*"],
  },
  {
    actions: ["storagegateway:CreateSnapshot", "storagegateway:ListTagsForResource"],
    resources: ["arn:aws:storagegateway:*:*:gateway/*/volume/*"],
  },
  { actions: ["ec2:CopySnapshot"], resources: ["arn:aws:ec2:*::snapshot/*"] },
  { actions: ["ec2:CopyImage"], resources: ["*"] },
  { actions: ["ec2:CreateTags", "ec2:DeleteSnapshot"], resources: ["arn:aws:ec2:*::snapshot/*"] },
  {
    actions: [
      "ec2:CreateImage",
      "ec2:DeregisterImage",
      "ec2:DescribeSnapshots",
      "ec2:DescribeTags",
      "ec2:DescribeImages",
      "ec2:DescribeInstances",
      "ec2:DescribeInstanceAttribute",
      "ec2:DescribeInstanceCreditSpecifications",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeElasticGpus",
      "ec2:DescribeSpotInstanceRequests",
      "ec2:DescribeSnapshotTierStatus",
    ],
    resources: ["*"],
  },
  { actions: ["ec2:CreateTags"], resources: ["arn:aws:ec2:*:*:image/*"] },
  { actions: ["ec2:ModifySnapshotAttribute", "ec2:ModifyImageAttribute"], resources: ["*"] },
  { actions: ["ec2:ModifySnapshotTier"], resources: ["arn:aws:ec2:*::snapshot/*"] },
  {
    actions: ["backup:DescribeBackupVault", "backup:CopyIntoBackupVault"],
    resources: ["arn:aws:backup:*:*:backup-vault:*"],
  },
  { actions: ["backup:CopyFromBackupVault"], resources: ["*"] },
  {
    actions: ["elasticfilesystem:Backup", "elasticfilesystem:DescribeTags"],
    resources: ["arn:aws:elasticfilesystem:*:*:file-system/*"],
  },
  {
    actions: [
      "ec2:CreateSnapshot",
      "ec2:DeleteSnapshot",
      "ec2:DescribeVolumes",
      "ec2:DescribeSnapshots",
    ],
    resources: ["*"],
  },
  { actions: ["kms:Decrypt", "kms:GenerateDataKey"], resources: ["*"] },
  { actions: ["kms:DescribeKey"], resources: ["*"] },
  { actions: ["kms:CreateGrant"], resources: ["*"] },
  {
    actions: ["kms:GenerateDataKeyWithoutPlaintext", "kms:ReEncryptTo", "kms:ReEncryptFrom"],
    resources: ["arn:aws:kms:*:*:key/*"],
  },
  { actions: ["tag:GetResources"], resources: ["*"] },
  { actions: ["ssm:CancelCommand", "ssm:GetCommandInvocation"], resources: ["*"] },
  {
    actions: ["ssm:SendCommand"],
    resources: ["arn:aws:ssm:*:*:document/AWSEC2-CreateVssSnapshot", "arn:aws:ec2:*:*:instance/*"],
  },
  { actions: ["fsx:DescribeBackups"], resources: ["arn:aws:fsx:*:*:backup/*"] },
  {
    actions: ["fsx:CreateBackup"],
    resources: [
      "arn:aws:fsx:*:*:file-system/*",
      "arn:aws:fsx:*:*:backup/*",
      "arn:aws:fsx:*:*:volume/*",
    ],
  },
  { actions: ["fsx:DescribeFileSystems"], resources: ["arn:aws:fsx:*:*:file-system/*"] },
  { actions: ["fsx:DescribeVolumes"], resources: ["arn:aws:fsx:*:*:volume/*"] },
  {
    actions: ["fsx:ListTagsForResource"],
    resources: ["arn:aws:fsx:*:*:file-system/*", "arn:aws:fsx:*:*:volume/*"],
  },
  { actions: ["fsx:DeleteBackup"], resources: ["arn:aws:fsx:*:*:backup/*"] },
  {
    actions: [
      "fsx:ListTagsForResource",
      "fsx:ManageBackupPrincipalAssociations",
      "fsx:CopyBackup",
      "fsx:TagResource",
    ],
    resources: ["arn:aws:fsx:*:*:backup/*"],
  },
  {
    actions: ["dynamodb:StartAwsBackupJob", "dynamodb:ListTagsOfResource"],
    resources: ["arn:aws:dynamodb:*:*:table/*"],
  },
  {
    actions: ["backup-gateway:Backup", "backup-gateway:ListTagsForResource"],
    resources: ["arn:aws:backup-gateway:*:*:vm/*"],
  },
  {
    actions: [
      "cloudformation:ListStacks",
      "cloudformation:GetTemplate",
      "cloudformation:DescribeStacks",
      "cloudformation:ListStackResources",
    ],
    resources: ["arn:aws:cloudformation:*:*:stack/*/*"],
  },
  {
    actions: [
      "redshift:CreateClusterSnapshot",
      "redshift:DescribeClusterSnapshots",
      "redshift:DescribeTags",
    ],
    resources: ["arn:aws:redshift:*:*:snapshot:*/*", "arn:aws:redshift:*:*:cluster:*"],
  },
  { actions: ["redshift:DeleteClusterSnapshot"], resources: ["arn:aws:redshift:*:*:snapshot:*/*"] },
  { actions: ["redshift:DescribeClusters"], resources: ["arn:aws:redshift:*:*:cluster:*"] },
  { actions: ["redshift:CreateTags"], resources: ["arn:aws:redshift:*:*:snapshot:*/*"] },
  {
    actions: ["redshift-serverless:CreateSnapshot"],
    resources: [
      "arn:aws:redshift-serverless:*:*:snapshot/*",
      "arn:aws:redshift-serverless:*:*:namespace/*",
    ],
  },
  {
    actions: ["redshift-serverless:DeleteSnapshot"],
    resources: ["arn:aws:redshift-serverless:*:*:snapshot/*"],
  },
  {
    actions: ["redshift-serverless:GetNamespace"],
    resources: ["arn:aws:redshift-serverless:*:*:namespace/*"],
  },
  {
    actions: ["redshift-serverless:GetSnapshot", "redshift-serverless:TagResource"],
    resources: ["arn:aws:redshift-serverless:*:*:snapshot/*"],
  },
  {
    actions: [
      "redshift-serverless:ListNamespaces",
      "redshift-serverless:ListSnapshots",
      "redshift-serverless:ListTagsForResource",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "timestream:StartAwsBackupJob",
      "timestream:GetAwsBackupStatus",
      "timestream:ListTables",
      "timestream:ListDatabases",
      "timestream:ListTagsForResource",
      "timestream:DescribeTable",
      "timestream:DescribeDatabase",
    ],
    resources: ["arn:aws:timestream:*:*:database/*"],
  },
  { actions: ["timestream:DescribeEndpoints"], resources: ["*"] },
  { actions: ["ssm-sap:GetOperation", "ssm-sap:ListDatabases"], resources: ["*"] },
  {
    actions: [
      "ssm-sap:BackupDatabase",
      "ssm-sap:UpdateHanaBackupSettings",
      "ssm-sap:GetDatabase",
      "ssm-sap:ListTagsForResource",
    ],
    resources: ["arn:aws:ssm-sap:*:*:*"],
  },
  { actions: ["backup:TagResource"], resources: ["arn:aws:backup:*:*:recovery-point:*"] },
  {
    actions: [
      "dsql:StartBackupJob",
      "dsql:GetBackupJob",
      "dsql:StopBackupJob",
      "dsql:GetCluster",
      "dsql:ListClusters",
      "dsql:ListTagsForResource",
    ],
    resources: ["*"],
  },
  { actions: ["kms:Decrypt"], resources: ["*"] },
  {
    actions: [
      "eks:ListClusters",
      "eks:ListTagsForResource",
      "eks:DescribeCluster",
      "eks:ListAddons",
      "eks:DescribeAddon",
      "eks:ListNodegroups",
      "eks:DescribeNodegroup",
      "eks:ListPodIdentityAssociations",
      "eks:DescribePodIdentityAssociation",
      "eks:ListAccessEntries",
      "eks:DescribeAccessEntry",
      "eks:ListAssociatedAccessPolicies",
      "eks:ListFargateProfiles",
      "eks:DescribeFargateProfile",
      "ec2:DescribeLaunchTemplateVersions",
    ],
    resources: ["*"],
  },
  { actions: ["eks:CreateAccessEntry"], resources: ["arn:aws:eks:*:*:cluster/*"] },
  {
    actions: ["eks:AssociateAccessPolicy", "eks:DisassociateAccessPolicy"],
    resources: ["arn:aws:eks:*:*:access-entry/*"],
  },
  { actions: ["guardduty:StartMalwareScan", "guardduty:GetMalwareScan"], resources: ["*"] },
  { actions: ["iam:PassRole"], resources: ["arn:aws:iam::*:role/*"] },
];
/**
 * AWSBackupServiceRolePolicyForRestores: policy version v36, edited August 27, 2026, 23:57 UTC, ARN arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores.
 * 47 Allow statements; 12 had a Condition (not copied). Source: https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSBackupServiceRolePolicyForRestores.html (read 2026-11-22).
 */
export const AWSBACKUPSERVICEROLEPOLICYFORRESTORES: readonly ManagedPolicyStatement[] = [
  {
    actions: [
      "dynamodb:Scan",
      "dynamodb:Query",
      "dynamodb:UpdateItem",
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:DescribeTable",
    ],
    resources: ["arn:aws:dynamodb:*:*:table/*"],
  },
  {
    actions: ["dynamodb:RestoreTableFromBackup"],
    resources: ["arn:aws:dynamodb:*:*:table/*/backup/*"],
  },
  {
    actions: ["ec2:CreateVolume", "ec2:DeleteVolume"],
    resources: ["arn:aws:ec2:*::snapshot/*", "arn:aws:ec2:*:*:volume/*"],
  },
  {
    actions: [
      "ec2:DescribeImages",
      "ec2:DescribeInstances",
      "ec2:DescribeSnapshots",
      "ec2:DescribeVolumes",
      "ec2:DescribeAccountAttributes",
      "ec2:DescribeAddresses",
      "ec2:DescribeAvailabilityZones",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSubnets",
      "ec2:DescribeVpcs",
      "ec2:DescribeInternetGateways",
      "ec2:DescribeSnapshotTierStatus",
      "ec2:DescribeRouteTables",
    ],
    resources: ["*"],
  },
  { actions: ["ec2:CreateTags"], resources: ["arn:aws:ec2:*:*:route-table/*"] },
  {
    actions: [
      "storagegateway:DeleteVolume",
      "storagegateway:DescribeCachediSCSIVolumes",
      "storagegateway:DescribeStorediSCSIVolumes",
      "storagegateway:AddTagsToResource",
    ],
    resources: ["arn:aws:storagegateway:*:*:gateway/*/volume/*"],
  },
  {
    actions: [
      "storagegateway:DescribeGatewayInformation",
      "storagegateway:CreateStorediSCSIVolume",
      "storagegateway:CreateCachediSCSIVolume",
    ],
    resources: ["arn:aws:storagegateway:*:*:gateway/*"],
  },
  { actions: ["storagegateway:ListVolumes"], resources: ["arn:aws:storagegateway:*:*:*"] },
  {
    actions: [
      "rds:DescribeDBInstances",
      "rds:DescribeDBSnapshots",
      "rds:ListTagsForResource",
      "rds:RestoreDBInstanceFromDBSnapshot",
      "rds:DeleteDBInstance",
      "rds:AddTagsToResource",
      "rds:DescribeDBClusters",
      "rds:RestoreDBClusterFromSnapshot",
      "rds:DeleteDBCluster",
      "rds:RestoreDBInstanceToPointInTime",
      "rds:DescribeDBClusterSnapshots",
      "rds:RestoreDBClusterToPointInTime",
      "rds:CreateTenantDatabase",
      "rds:DeleteTenantDatabase",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "elasticfilesystem:Restore",
      "elasticfilesystem:CreateFilesystem",
      "elasticfilesystem:DescribeFilesystems",
      "elasticfilesystem:DeleteFilesystem",
      "elasticfilesystem:TagResource",
    ],
    resources: ["arn:aws:elasticfilesystem:*:*:file-system/*"],
  },
  { actions: ["kms:DescribeKey"], resources: ["*"] },
  {
    actions: [
      "dsql:StartRestoreJob",
      "dsql:GetRestoreJob",
      "dsql:StopRestoreJob",
      "dsql:TagResource",
      "dsql:CreateCluster",
      "dsql:PutMultiRegionProperties",
      "dsql:PutWitnessRegion",
      "dsql:UpdateCluster",
      "dsql:AddPeerCluster",
      "dsql:RemovePeerCluster",
      "dsql:GetCluster",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:ReEncryptTo",
      "kms:ReEncryptFrom",
      "kms:GenerateDataKeyWithoutPlaintext",
      "kms:DescribeKey",
    ],
    resources: ["*"],
  },
  { actions: ["kms:CreateGrant"], resources: ["*"] },
  {
    actions: ["ebs:CompleteSnapshot", "ebs:StartSnapshot", "ebs:PutSnapshotBlock"],
    resources: ["arn:aws:ec2:*::snapshot/*"],
  },
  { actions: ["rds:CreateDBInstance"], resources: ["arn:aws:rds:*:*:db:*"] },
  {
    actions: ["ec2:DeleteSnapshot", "ec2:DeleteTags", "ec2:RestoreSnapshotTier"],
    resources: ["arn:aws:ec2:*::snapshot/*"],
  },
  {
    actions: ["ec2:CreateTags"],
    resources: ["arn:aws:ec2:*::snapshot/*", "arn:aws:ec2:*:*:instance/*"],
  },
  { actions: ["ec2:RunInstances"], resources: ["*"] },
  { actions: ["ec2:TerminateInstances"], resources: ["arn:aws:ec2:*:*:instance/*"] },
  {
    actions: ["ec2:CreateTags"],
    resources: ["arn:aws:ec2:*:*:instance/*", "arn:aws:ec2:*:*:volume/*"],
  },
  {
    actions: ["fsx:CreateFileSystemFromBackup"],
    resources: ["arn:aws:fsx:*:*:file-system/*", "arn:aws:fsx:*:*:backup/*"],
  },
  {
    actions: ["fsx:DescribeFileSystems", "fsx:TagResource"],
    resources: ["arn:aws:fsx:*:*:file-system/*"],
  },
  { actions: ["fsx:DescribeBackups"], resources: ["arn:aws:fsx:*:*:backup/*"] },
  {
    actions: ["fsx:DeleteFileSystem", "fsx:UntagResource"],
    resources: ["arn:aws:fsx:*:*:file-system/*"],
  },
  { actions: ["fsx:DescribeVolumes"], resources: ["arn:aws:fsx:*:*:volume/*"] },
  {
    actions: ["fsx:CreateVolumeFromBackup", "fsx:TagResource"],
    resources: ["arn:aws:fsx:*:*:volume/*"],
  },
  {
    actions: ["fsx:CreateVolumeFromBackup", "fsx:TagResource"],
    resources: [
      "arn:aws:fsx:*:*:storage-virtual-machine/*",
      "arn:aws:fsx:*:*:backup/*",
      "arn:aws:fsx:*:*:volume/*",
    ],
  },
  { actions: ["fsx:DeleteVolume", "fsx:UntagResource"], resources: ["arn:aws:fsx:*:*:volume/*"] },
  { actions: ["ds:DescribeDirectories"], resources: ["*"] },
  { actions: ["dynamodb:RestoreTableFromAwsBackup"], resources: ["arn:aws:dynamodb:*:*:table/*"] },
  { actions: ["backup-gateway:Restore"], resources: ["arn:aws:backup-gateway:*:*:hypervisor/*"] },
  {
    actions: [
      "cloudformation:CreateChangeSet",
      "cloudformation:DescribeChangeSet",
      "cloudformation:TagResource",
      "cloudformation:UntagResource",
    ],
    resources: ["arn:aws:cloudformation:*:*:*/*/*"],
  },
  {
    actions: ["redshift:RestoreFromClusterSnapshot", "redshift:RestoreTableFromClusterSnapshot"],
    resources: [
      "arn:aws:redshift:*:*:snapshot:*/*",
      "arn:aws:redshift:*:*:cluster:*",
      "arn:aws:redshift-serverless:*:*:snapshot/*",
    ],
  },
  { actions: ["redshift:DescribeClusters"], resources: ["arn:aws:redshift:*:*:cluster:*"] },
  { actions: ["redshift:DescribeTableRestoreStatus"], resources: ["*"] },
  {
    actions: ["redshift-serverless:RestoreTableFromSnapshot"],
    resources: [
      "arn:aws:redshift-serverless:*:*:namespace/*",
      "arn:aws:redshift-serverless:*:*:workgroup/*",
      "arn:aws:redshift-serverless:*:*:snapshot/*",
    ],
  },
  {
    actions: ["redshift-serverless:GetNamespace"],
    resources: ["arn:aws:redshift-serverless:*:*:namespace/*"],
  },
  { actions: ["redshift-serverless:GetTableRestoreStatus"], resources: ["*"] },
  {
    actions: [
      "timestream:StartAwsRestoreJob",
      "timestream:GetAwsRestoreStatus",
      "timestream:ListTables",
      "timestream:ListTagsForResource",
      "timestream:ListDatabases",
      "timestream:DescribeTable",
      "timestream:DescribeDatabase",
    ],
    resources: ["arn:aws:timestream:*:*:database/*"],
  },
  { actions: ["timestream:DescribeEndpoints"], resources: ["*"] },
  {
    actions: [
      "eks:CreateCluster",
      "eks:DescribeCluster",
      "eks:CreateAccessEntry",
      "eks:DescribeAccessEntry",
      "eks:AssociateAccessPolicy",
      "eks:ListAssociatedAccessPolicies",
      "eks:CreateAddon",
      "eks:DescribeAddon",
      "eks:CreateNodegroup",
      "eks:DescribeNodegroup",
      "eks:CreateFargateProfile",
      "eks:DescribeFargateProfile",
      "eks:CreatePodIdentityAssociation",
      "eks:DescribePodIdentityAssociation",
      "eks:TagResource",
    ],
    resources: [
      "arn:aws:eks:*:*:access-entry/*",
      "arn:aws:eks:*:*:addon/*",
      "arn:aws:eks:*:*:cluster/*",
      "arn:aws:eks:*:*:fargateprofile/*",
      "arn:aws:eks:*:*:nodegroup/*",
      "arn:aws:eks:*:*:podidentityassociation/*",
    ],
  },
  {
    actions: ["eks:AssociateAccessPolicy", "eks:DisassociateAccessPolicy"],
    resources: ["arn:aws:eks:*:*:access-entry/*"],
  },
  { actions: ["iam:PassRole"], resources: ["arn:aws:iam::*:role/*"] },
  {
    actions: [
      "ec2:DescribeLaunchTemplateVersions",
      "ec2:DescribeSubnets",
      "ec2:RunInstances",
      "iam:GetRole",
      "iam:ListAttachedRolePolicies",
    ],
    resources: ["*"],
  },
  {
    actions: ["ec2:CreateTags"],
    resources: [
      "arn:aws:ec2:*:*:instance/*",
      "arn:aws:ec2:*:*:volume/*",
      "arn:aws:ec2:*:*:network-interface/*",
    ],
  },
  {
    actions: [
      "backup:StartRestoreJob",
      "backup:ListRestoreJobs",
      "backup:ListRecoveryPointsByBackupVault",
      "backup:DescribeRestoreJob",
    ],
    resources: ["*"],
  },
];
