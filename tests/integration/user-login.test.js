import { test, expect } from '@playwright/test';

// Reset storage state for unauthenticated tests
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('User Authentication Flow', () => {
  test('should allow user to login successfully', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    
    // Verify login form is present
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    
    // Fill login form with valid credentials
    await page.getByLabel('Email').fill('test123@gmail.com');
    await page.getByLabel('Password').fill('1234qwer');
    
    // Submit login form
    await page.getByRole('button', { name: 'Log in' }).click();
    
    // Verify successful login redirect
    await expect(page).toHaveURL('/');
    
    await expect(page.getByText('Profile')).toBeVisible();
  });

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
});