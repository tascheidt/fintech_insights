#!/usr/bin/env npx tsx
/**
 * Test script for multi-user weekly digest email system
 * 
 * Tests:
 * 1. Database migration verification
 * 2. User query with email preferences
 * 3. Batch email sending logic (dry-run)
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/test-multi-user-digest.ts
 */

import { isOptedInToWeeklyDigest } from "../lib/email/digest-recipients";
import { createAdminClient } from "../lib/supabase/admin";

// Check environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL is not set");
  console.error("   Please set it in your .env.local file or environment");
  console.error("   Usage: npx tsx --env-file=.env.local web/scripts/test-multi-user-digest.ts");
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is not set");
  console.error("   Please set it in your .env.local file or environment");
  console.error("   Usage: npx tsx --env-file=.env.local web/scripts/test-multi-user-digest.ts");
  process.exit(1);
}

async function testDatabaseSchema() {
  console.log("🔍 Testing database schema...\n");
  
  const supabase = createAdminClient();
  
  // Test 1: Check if email_preferences column exists
  console.log("Test 1: Checking email_preferences column in profiles table");
  const { data: profileSample, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, email_preferences")
    .limit(1);
  
  if (profileError) {
    console.error("❌ Error querying profiles:", profileError);
    return false;
  }
  
  if (profileSample && profileSample.length > 0) {
    console.log("✅ email_preferences column exists");
    console.log(`   Sample: ${JSON.stringify(profileSample[0].email_preferences)}`);
  } else {
    console.log("⚠️  No profiles found (this is okay if database is empty)");
  }
  
  // Test 2: Check if weekly_digest_deliveries table exists
  console.log("\nTest 2: Checking weekly_digest_deliveries table");
  const { data: deliveriesSample, error: deliveriesError } = await supabase
    .from("weekly_digest_deliveries")
    .select("id")
    .limit(1);
  
  if (deliveriesError) {
    if (deliveriesError.code === "42P01") {
      console.error("❌ weekly_digest_deliveries table does not exist!");
      console.error("   Please run the migration: 20260124000000_multi_user_digest.sql");
      return false;
    }
    console.error("❌ Error querying deliveries:", deliveriesError);
    return false;
  }
  
  console.log("✅ weekly_digest_deliveries table exists");
  
  return true;
}

async function testUserQuery() {
  console.log("\n🔍 Testing user query logic...\n");
  
  const supabase = createAdminClient();
  
  // Fetch all users
  console.log("Test 3: Fetching users with email preferences");
  const { data: users, error: usersError } = await supabase
    .from("profiles")
    .select("id, email, email_preferences");
  
  if (usersError) {
    console.error("❌ Error fetching users:", usersError);
    return false;
  }
  
  console.log(`✅ Found ${users?.length || 0} total users`);
  
  const optedInUsers = (users || [])
    .filter((u) => isOptedInToWeeklyDigest(u))
    .map((u) => ({ id: u.id, email: u.email! }));
  
  console.log(`✅ Found ${optedInUsers.length} users opted in to weekly digest`);
  
  if (optedInUsers.length > 0) {
    console.log("\n   Opted-in users:");
    optedInUsers.slice(0, 5).forEach((u, i) => {
      console.log(`   ${i + 1}. ${u.email} (${u.id})`);
    });
    if (optedInUsers.length > 5) {
      console.log(`   ... and ${optedInUsers.length - 5} more`);
    }
  } else {
    console.log(
      "⚠️  No recipients: every profile is missing email or opted out of weekly digest"
    );
  }
  
  // Test chunking logic
  console.log("\nTest 4: Testing batch chunking logic");
  function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  const userChunks = chunk(optedInUsers, 100);
  console.log(`✅ Would send in ${userChunks.length} batch(es) of up to 100 users each`);
  
  if (userChunks.length > 0) {
    userChunks.forEach((chunk, i) => {
      console.log(`   Batch ${i + 1}: ${chunk.length} users`);
    });
  }
  
  return true;
}

async function testDeliveryTracking() {
  console.log("\n🔍 Testing delivery tracking...\n");
  
  const supabase = createAdminClient();
  
  // Check if we can insert a test delivery record
  console.log("Test 5: Testing delivery record insertion");
  
  // Get a sample digest ID (or create a test one)
  const { data: recentDigest } = await supabase
    .from("weekly_digests")
    .select("id")
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();
  
  if (!recentDigest) {
    console.log("⚠️  No weekly digests found - skipping delivery tracking test");
    return true;
  }
  
  // Get a sample user
  const { data: sampleUser } = await supabase
    .from("profiles")
    .select("id, email")
    .limit(1)
    .single();
  
  if (!sampleUser) {
    console.log("⚠️  No users found - skipping delivery tracking test");
    return true;
  }
  
  // Try to insert a test delivery record
  const testDelivery = {
    digest_id: recentDigest.id,
    user_id: sampleUser.id,
    email: sampleUser.email,
    status: "sent" as const,
    error_message: null,
  };
  
  const { error: insertError } = await supabase
    .from("weekly_digest_deliveries")
    .insert(testDelivery);
  
  if (insertError) {
    console.error("❌ Error inserting test delivery:", insertError);
    return false;
  }
  
  console.log("✅ Successfully inserted test delivery record");
  
  // Clean up test record
  await supabase
    .from("weekly_digest_deliveries")
    .delete()
    .eq("digest_id", recentDigest.id)
    .eq("user_id", sampleUser.id)
    .eq("status", "sent");
  
  console.log("✅ Cleaned up test delivery record");
  
  return true;
}

async function main() {
  console.log("🧪 Multi-User Digest Email System Test\n");
  console.log("=" .repeat(50) + "\n");
  
  try {
    const schemaOk = await testDatabaseSchema();
    if (!schemaOk) {
      console.error("\n❌ Schema tests failed. Please check the migration.");
      process.exit(1);
    }
    
    const queryOk = await testUserQuery();
    if (!queryOk) {
      console.error("\n❌ User query tests failed.");
      process.exit(1);
    }
    
    const trackingOk = await testDeliveryTracking();
    if (!trackingOk) {
      console.error("\n❌ Delivery tracking tests failed.");
      process.exit(1);
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("✅ All tests passed!");
    console.log("\nNext steps:");
    console.log("1. Ensure RESEND_API_KEY is configured");
    console.log("2. Test the endpoint manually:");
    console.log('   curl -X GET "http://localhost:3000/api/cron/report" \\');
    console.log('     -H "Authorization: Bearer <CRON_SECRET>"');
    console.log("3. Or use the admin trigger endpoint:");
    console.log('   POST /api/admin/trigger with {"job_type": "report"}');
    
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    process.exit(1);
  }
}

main();
