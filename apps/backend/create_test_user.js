const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://ujpdvjaxitgykrrsblfk.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqcGR2amF4aXRneWtycnNibGZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE5MDU0NywiZXhwIjoyMDg5NzY2NTQ3fQ.BIzP8Z2W9O9Q68d8slc3b-IUP8h6_yyZEeOm4zpFrYw';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestUser() {
  const email = 'qa_regression_test@example.com';
  const password = 'Password123!';

  console.log(`Creating user: ${email}...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('User already exists, updating password...');
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw listError;
      const user = listData.users.find(u => u.email === email);
      if (user) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password });
        if (updateError) throw updateError;
        console.log('Password updated.');
      }
    } else {
      console.error('Error creating user:', error.message);
    }
  } else {
    console.log('User created successfully:', data.user.id);
  }
}

createTestUser();
