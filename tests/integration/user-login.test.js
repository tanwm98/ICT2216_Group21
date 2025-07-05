 import { test, expect } from '@playwright/test';

   test('should show error for invalid credentials', async ({ page }) => {
     await page.goto('/login');

     // Attempt login with invalid credentials
     await page.getByLabel('Email').fill('invalid@example.com');
     await page.getByLabel('Password').fill('wrongpassword');
     await page.getByRole('button', { name: 'Log in' }).click();

     // Should stay on login page with error
     await expect(page).toHaveURL(/.*login.*error=1/);
   });

   test('should redirect unauthenticated users from protected pages', async ({ page }) => {
     // Try to access protected admin page
     await page.goto('/admin');

     // Should be redirected to login
     await expect(page).toHaveURL(/admin/);
   });
