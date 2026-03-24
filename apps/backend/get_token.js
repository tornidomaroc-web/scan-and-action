const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://ujpdvjaxitgykrrsblfk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqcGR2amF4aXRneWtycnNibFZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTA1NDcsImV4cCI6MjA4OTc2NjU0N30.GwaIgXTDbkxEgfv8ROCDghIX6CGTh-SQk0IHlb-JInQ';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getToken() {
  const email = 'qa_regression_test@example.com';
  const password = 'Password123!';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('Error signing in:', error.message);
  } else {
    console.log(data.session.access_token);
  }
}

getToken();
