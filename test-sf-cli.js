#!/usr/bin/env node

/**
 * Quick test script to verify SF CLI integration
 *
 * Usage: node test-sf-cli.js <org-alias>
 */

const { execSync } = require('child_process');

const orgAlias = process.argv[2] || 'orgfarm-org';

// Validate org alias to prevent command injection
if (!/^[a-zA-Z0-9_-]+$/.test(orgAlias)) {
  console.error('❌ Invalid org alias. Only alphanumeric characters, hyphens, and underscores allowed.');
  process.exit(1);
}

console.log(`Testing SF CLI integration with org: ${orgAlias}\n`);

try {
  // Test 1: Get org info
  console.log('1. Fetching org info from SF CLI...');
  const result = execSync(
    `sf org display --target-org ${orgAlias} --json`,
    { encoding: 'utf-8' }
  );

  const orgInfo = JSON.parse(result);

  if (orgInfo.status !== 0) {
    console.error('❌ SF CLI returned error:', orgInfo.message || JSON.stringify(orgInfo));
    process.exit(1);
  }

  const instanceUrl = orgInfo.result.instanceUrl;
  const username = orgInfo.result.username;

  console.log('✅ Successfully connected to org');
  console.log(`   Instance URL: ${instanceUrl}`);
  console.log(`   Username: ${username}`);

  // Test 2: Make a test API call using sf api request
  console.log('\n2. Testing Grid Connect API using sf api request...');
  const apiResult = execSync(
    `sf api request rest "/services/data/v66.0/public/grid/workbooks" --method GET --target-org ${orgAlias} --json`,
    { encoding: 'utf-8' }
  );

  const apiResponse = JSON.parse(apiResult);

  if (apiResponse.status !== 0) {
    console.error('❌ API call failed:', apiResponse.message);
    process.exit(1);
  }

  console.log('✅ Successfully called Grid Connect API');
  console.log(`   Workbooks found: ${apiResponse.result?.workbooks?.length || 0}`);

  console.log('\n✅ All tests passed! SF CLI integration is working correctly.');
  console.log('\nYou can now use the following environment variables:');
  console.log(`   INSTANCE_URL="${instanceUrl}"`);
  console.log(`   ORG_ALIAS="${orgAlias}"`);

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error('\nTroubleshooting:');
  console.error('1. Make sure SF CLI is installed: brew install sf');
  console.error(`2. Make sure you are logged in: sf org login web --alias ${orgAlias}`);
  console.error('3. Check org alias: sf org list');
  process.exit(1);
}
