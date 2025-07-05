// import { test as setup, expect } from '@playwright/test';
// import path from 'path';

// const adminAuthFile = path.join(__dirname, '.auth/admin.json');

// setup('authenticate as admin', async ({ page }) => {
//   // Navigate to login page
//   await page.goto('/login');

//   // Perform admin login - use your actual admin credentials
//   await page.getByLabel('Email').fill('admin@test.com');
//   await page.getByLabel('Password').fill('test123');
//   await page.getByRole('button', { name: 'Log in' }).click();

//   // Wait for redirect to admin dashboard
//   await page.waitForURL('/admin');
  
//   // Verify we're logged in as admin
//   await expect(page.getByText('Admin Panel')).toBeVisible();

//   // Save admin authentication state
//   await page.context().storageState({ path: adminAuthFile });
// });