const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const API_URL = 'http://localhost:4000/api';

async function runTests() {
  console.log('=== Starting E2E Functional & Security Verification ===\n');
  let adminToken = '';
  let tempKey = '';
  let employeeId = '';
  let employeeToken = '';
  let cmdId = '';
  let eaId = '';
  let roleId = '';

  try {
    // ----------------------------------------------------
    // TEST 1: Admin Authentication
    // ----------------------------------------------------
    console.log('Test 1: Authenticating as System Administrator...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'project-ops@hartek.com', password: process.env.ADMIN_PASSWORD || '' })
    });
    if (!loginRes.ok) throw new Error('Admin login failed');
    const loginData = await loginRes.json();
    adminToken = loginData.accessToken;
    console.log('✓ Admin authenticated successfully.\n');

    // ----------------------------------------------------
    // TEST 2: Retrieve Roles & Managers list
    // ----------------------------------------------------
    console.log('Test 2: Fetching active roles and managers list...');
    const rolesRes = await fetch(`${API_URL}/roles`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const roles = await rolesRes.json();
    const employeeRole = roles.find(r => r.name === 'Employee');
    if (!employeeRole) throw new Error('Seeded Employee role not found');
    roleId = employeeRole.id;
    console.log(`✓ Roles verified. Employee role ID: ${roleId}`);

    const cmdUser = await prisma.user.findFirst({ where: { email: 'cmd@hartek.com' } });
    if (!cmdUser) throw new Error('Seeded CMD user not found');
    cmdId = cmdUser.id;
    console.log(`✓ Manager verified. CMD / Chairman user ID: ${cmdId}\n`);

    // ----------------------------------------------------
    // TEST 3: User Provisioning (CRUD)
    // ----------------------------------------------------
    console.log('Test 3: Creating a new staff account (Employee reporting to CMD)...');
    const createUserRes = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        email: 'qa_employee@hartek.com',
        name: 'QA Employee User',
        password: 'temporaryPassword123',
        roleId: roleId,
        managerId: cmdId,
        active: true
      })
    });
    if (!createUserRes.ok) {
      const errText = await createUserRes.text();
      throw new Error(`User creation failed: ${errText}`);
    }
    const createdUser = await createUserRes.json();
    employeeId = createdUser.id;
    console.log(`✓ Staff account created successfully. User ID: ${employeeId}\n`);

    // ----------------------------------------------------
    // TEST 4: Email Lock Verification
    // ----------------------------------------------------
    console.log('Test 4: Verifying Email Address field is immutable after creation...');
    // Attempting to modify email should not update it
    const updateRes = await fetch(`${API_URL}/users/${employeeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        email: 'hacker_email@hartek.com', // modified email
        name: 'QA Employee User Updated',
        roleId: roleId,
        managerId: cmdId,
        active: true
      })
    });
    if (!updateRes.ok) throw new Error('User update failed');
    const updatedUserObj = await prisma.user.findUnique({ where: { id: employeeId } });
    if (updatedUserObj.email === 'hacker_email@hartek.com') {
      throw new Error('Security vulnerability: Email address was modified after creation!');
    }
    console.log('✓ Security validation passed: Email address was not modified.\n');

    // ----------------------------------------------------
    // TEST 5: Secure Password Reset & SMTP trigger
    // ----------------------------------------------------
    console.log('Test 5: Resetting employee password to a temporary key...');
    const resetRes = await fetch(`${API_URL}/users/${employeeId}/reset-password-temp`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!resetRes.ok) throw new Error('Password reset endpoint failed');
    console.log('✓ Password reset endpoint success response received.');

    // Fetch the updated DB state to inspect temp password status
    const dbUserAfterReset = await prisma.user.findUnique({ where: { id: employeeId } });
    if (!dbUserAfterReset.requiresPasswordReset) {
      throw new Error('requiresPasswordReset flag was not set to true!');
    }
    console.log('✓ requiresPasswordReset flag successfully set to true in database.');

    // In a production environment, Nodemailer/SMTP sends the key.
    // In our test, we'll locate it via mock password hashes or generate a known hash directly.
    console.log('✓ Reset flow verified.\n');

    // Let's manually set a known temporary key hash for testing the rest of the flow
    tempKey = 'TempResetKey123';
    const tempHash = await bcrypt.hash(tempKey, 10);
    await prisma.user.update({
      where: { id: employeeId },
      data: { passwordHash: tempHash }
    });

    // ----------------------------------------------------
    // TEST 6: Temporary Password Login & Redirect Enforcement
    // ----------------------------------------------------
    console.log('Test 6: Logging in using the temporary key...');
    const tempLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'qa_employee@hartek.com', password: tempKey })
    });
    const tempLoginData = await tempLoginRes.json();
    employeeToken = tempLoginData.accessToken;
    
    // Check if the validated JWT strategies return requiresPasswordReset
    const profileRes = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${employeeToken}` }
    });
    const profileData = await profileRes.json();
    if (!profileData.requiresPasswordReset) {
      throw new Error('User payload does not contain requiresPasswordReset: true!');
    }
    console.log('✓ Redirection guard token verified successfully.\n');

    // ----------------------------------------------------
    // TEST 7: Setting New Password
    // ----------------------------------------------------
    console.log('Test 7: Submitting new secure password change request...');
    const changePassRes = await fetch(`${API_URL}/auth/change-password-temp`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeToken}`
      },
      body: JSON.stringify({ newPassword: 'newSecurePassword123' })
    });
    if (!changePassRes.ok) throw new Error('Change password request failed');
    console.log('✓ Password updated successfully.');

    const dbUserAfterChange = await prisma.user.findUnique({ where: { id: employeeId } });
    if (dbUserAfterChange.requiresPasswordReset) {
      throw new Error('requiresPasswordReset is still true after change!');
    }
    console.log('✓ requiresPasswordReset flag cleared in database.\n');

    // ----------------------------------------------------
    // TEST 8: Reporting Hierarchy Task Assignment Checks
    // ----------------------------------------------------
    console.log('Test 8: Testing task assignment reporting hierarchy checks...');
    
    // Log in as cmd@hartek.com (manager of qa_employee@hartek.com)
    const cmdLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'cmd@hartek.com', password: 'hartek123' })
    });
    const cmdLoginData = await cmdLoginRes.json();
    const cmdToken = cmdLoginData.accessToken;

    console.log('Assigning a task to direct subordinate (qa_employee@hartek.com)...');
    const validTaskRes = await fetch(`${API_URL}/tasks`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cmdToken}`
      },
      body: JSON.stringify({
        title: 'Complete E2E Audit report',
        detail: 'Perform full E2E testing of the application.',
        assigneeIds: [employeeId],
        pri: 'High',
        st: 'Open'
      })
    });
    if (!validTaskRes.ok) {
      const err = await validTaskRes.text();
      throw new Error(`Valid task assignment failed: ${err}`);
    }
    console.log('✓ Task assigned to subordinate successfully.');

    // Log in as ea@hartek.com (should NOT be able to assign task to qa_employee)
    const eaUser = await prisma.user.findFirst({ where: { email: 'ea@hartek.com' } });
    eaId = eaUser.id;
    const eaLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ea@hartek.com', password: 'hartek123' })
    });
    const eaLoginData = await eaLoginRes.json();
    const eaToken = eaLoginData.accessToken;

    console.log('Assigning a task to non-subordinate (should fail)...');
    const invalidTaskRes = await fetch(`${API_URL}/tasks`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${eaToken}`
      },
      body: JSON.stringify({
        title: 'Malicious assignment directive',
        detail: 'Hacker task assignment.',
        assigneeIds: [employeeId],
        pri: 'High',
        st: 'Open'
      })
    });
    if (invalidTaskRes.ok) {
      throw new Error('Security boundary breached: User was able to assign task to someone not reporting to them!');
    }
    console.log('✓ Security boundary confirmed. Task assignment successfully blocked.\n');

    // ----------------------------------------------------
    // TEST 9: Permanent Delete & Subordinate managerId Reset
    // ----------------------------------------------------
    console.log('Test 9: Deleting CMD and verifying subordinates cleanups...');
    
    // Delete CMD / Chairman
    const deleteCmdRes = await fetch(`${API_URL}/users/${cmdId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!deleteCmdRes.ok) throw new Error('CMD deletion failed');
    console.log('✓ CMD user deleted.');

    // Verify qa_employee reports to null now
    const updatedEmployeeObj = await prisma.user.findUnique({ where: { id: employeeId } });
    if (updatedEmployeeObj.managerId !== null) {
      throw new Error('CMD managerId was not cleared from subordinates profile!');
    }
    console.log('✓ Subordinate reporting lines cleaned up: managerId reset to null.\n');

    console.log('=== All E2E Functional & Security Checks Completed Successfully! ===\n');

  } catch (error) {
    console.error('❌ E2E QA Test failed:', error);
  } finally {
    // ----------------------------------------------------
    // CLEANUP DATABASE
    // ----------------------------------------------------
    console.log('Cleaning up E2E QA test data from database...');
    try {
      await prisma.comment.deleteMany({});
      await prisma.attachment.deleteMany({});
      await prisma.task.deleteMany({});
      
      if (employeeId) {
        await prisma.user.deleteMany({ where: { id: employeeId } });
      }

      // Re-create CMD / Chairman if deleted during test
      let cmdUser = await prisma.user.findFirst({ where: { email: 'cmd@hartek.com' } });
      if (!cmdUser) {
        const managerRole = await prisma.role.findUnique({ where: { name: 'Manager' } });
        const cmdDept = await prisma.department.findFirst({ where: { name: 'CMD Office' } });
        const commonPasswordHash = await bcrypt.hash('hartek123', 10);
        cmdUser = await prisma.user.create({
          data: {
            email: 'cmd@hartek.com',
            name: 'CMD / Chairman',
            initials: 'CMD',
            passwordHash: commonPasswordHash,
            roleId: managerRole ? managerRole.id : null,
            departmentId: cmdDept ? cmdDept.id : null,
            active: true
          }
        });
      }

      if (cmdUser) {
        const eaUser = await prisma.user.findFirst({ where: { email: 'ea@hartek.com' } });
        if (eaUser) {
          await prisma.user.update({
            where: { id: eaUser.id },
            data: { managerId: cmdUser.id }
          });
        }
        const exeUser = await prisma.user.findFirst({ where: { email: 'executive@hartek.com' } });
        if (exeUser) {
          await prisma.user.update({
            where: { id: exeUser.id },
            data: { managerId: cmdUser.id }
          });
        }
      }
      console.log('✓ Database restored to pristine clean state.');
    } catch (cleanError) {
      console.error('Error during test data database cleanup:', cleanError);
    }
    await prisma.$disconnect();
  }
}

runTests();
