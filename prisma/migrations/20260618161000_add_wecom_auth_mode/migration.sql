CREATE TYPE "WecomAuthMode" AS ENUM ('SELF_BUILT_APP', 'LEGACY_CUSTOMER_CONTACT');

ALTER TABLE "wecom_integrations" ADD COLUMN "authMode" "WecomAuthMode";
