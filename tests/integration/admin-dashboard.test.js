// import { test, expect } from '@playwright/test';

// // Use pre-authenticated admin state for these tests
// test.use({ storageState: 'tests/integration/.auth/admin.json' });

// test.describe('Admin Panel', () => {
//   test('should display admin dashboard correctly', async ({ page }) => {
//     await page.goto('/admin');
    
//     // Verify admin dashboard elements
//     await expect(page.getByText('Admin Panel')).toBeVisible();
//     await expect(page.getByText('Dashboard')).toBeVisible();
//     await expect(
//       page.getByRole('link', { name: 'Restaurants' })
//     ).toBeVisible();
//     await expect(page.getByText('Users', { exact: true })).toBeVisible();
//     await expect(page.getByText('Reservations', { exact: true })).toBeVisible();
//     await expect(
//       page.getByRole('link', { name: 'Pending Approval' })
//     ).toBeVisible();
//   });

//   test('should load dashboard statistics', async ({ page }) => {
//     await page.goto('/admin');
    
//     // Wait for dashboard stats to load
//     await page.waitForTimeout(3000);
    
//     // Verify statistics cards are present and have values
//     await expect(page.locator('#totalUsers')).toBeVisible();
//     await expect(page.locator('#totalRestaurants')).toBeVisible();
//     await expect(page.locator('#totalReservations')).toBeVisible();
    
//     // Verify the values are numbers (not loading or error states)
//     const totalUsers = await page.locator('#totalUsers').textContent();
//     const totalRestaurants = await page.locator('#totalRestaurants').textContent();
//     const totalReservations = await page.locator('#totalReservations').textContent();
    
//     expect(parseInt(totalUsers)).toBeGreaterThanOrEqual(0);
//     expect(parseInt(totalRestaurants)).toBeGreaterThanOrEqual(0);
//     expect(parseInt(totalReservations)).toBeGreaterThanOrEqual(0);
//   });
// });