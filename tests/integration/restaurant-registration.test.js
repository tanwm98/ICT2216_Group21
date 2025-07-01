import { test, expect } from '@playwright/test';
import path from 'path';

// Use unauthenticated state for registration tests
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Restaurant Owner Registration', () => {
  test('should complete restaurant registration flow', async ({ page }) => {
    await page.goto('/rOwnerReg');
    
    // Verify registration form is present
    await expect(page.getByText('Restaurant Owner Registration')).toBeVisible();
    
    // Fill owner information
    await page.getByLabel('Owner Username').fill('testowner');
    await page.getByLabel('First Name').fill('Test');
    await page.getByLabel('Last Name').fill('Owner');
    const testEmail = `testowner+${Date.now()}@example.com`;
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill('TestPass123');
    await page.getByLabel('Confirm Password').fill('TestPass123');
    
    // Fill restaurant information
    await page.getByLabel('Restaurant Name').fill('Test Restaurant');
    await page.getByLabel('Address', { exact: true }).fill('123 Test Street, Test Building, Unit 01-01');
    await page.getByLabel('Postal Code').fill('123456');
    await page.selectOption('select[name="cuisine"]', 'Italian');
    await page.selectOption('select[name="location"]', 'Orchard');
    await page.selectOption('select[name="priceRange"]', '$$');
    await page.getByLabel('Seating Capacity').fill('50');
    await page.getByLabel('Total Capacity').fill('60');
    await page.getByLabel('Opening Hour').fill('10:00');
    await page.getByLabel('Closing Hour').fill('22:00');
    
    // Upload a test image
    const testImagePath = path.join(__dirname, '../fixtures/test.png');
    await page.getByLabel('Upload Restaurant Image').setInputFiles(testImagePath);
    
    // Accept terms and conditions
    await page.getByLabel('I agree to the Terms and Conditions').check();
    
    // Submit the form
    await page.getByRole('button', { name: 'Submit Application' }).click();
    
    // Verify success message or redirect
    await expect(page.getByText(/successfully/i)).toBeVisible({ timeout: 15000 });
    
    // Should redirect to success page or show success message
    await expect(page).toHaveURL(/login/);
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/rOwnerReg');
    
    // Try to submit empty form
    await page.getByRole('button', { name: 'Submit Application' }).click();
    
    // Wait and check for error alert (your JS shows error alerts)
    await expect(
      page.locator('.invalid-feedback', {
        hasText: 'Username must be 3-20 characters',
      })
    ).toBeVisible();
    
    // Form should not submit
    await expect(page).toHaveURL('/rOwnerReg');
  });

  test('should validate password confirmation', async ({ page }) => {
    await page.goto('/rOwnerReg');
    
    // Fill passwords that don't match
    await page.getByLabel('Password', { exact: true }).fill('TestPass123');
    await page.getByLabel('Confirm Password').fill('DifferentPass123');
    
    // Move focus away to trigger validation
    await page.getByLabel('Restaurant Name').click();
    
    // Verify password mismatch error
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });
});