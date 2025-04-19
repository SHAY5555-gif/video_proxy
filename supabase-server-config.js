require('dotenv').config();

const supabaseConfig = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  projectId: process.env.SUPABASE_PROJECT_ID,
};

module.exports = {
  supabaseUrl: supabaseConfig.url,
  supabaseKey: supabaseConfig.key,
  supabaseProjectId: supabaseConfig.projectId,
}; 