const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const bcrypt = require('../backend/node_modules/bcrypt');
const fs = require('fs');
const path = require('path');

// Manually parse backend/.env to load DATABASE_URL
const envPath = path.join(__dirname, '../backend/.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2] ? match[2].trim() : '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  });
}

const prisma = new PrismaClient();

async function run() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Administrator';
  const initials = process.argv[5] || 'AD';

  if (!email || !password) {
    console.log('\nUsage: node scripts/create-admin.js <email> <password> [name] [initials]');
    console.log('Example: node scripts/create-admin.js myadmin@hartek.com "MySecurePassword123!" "Admin User" "AU"\n');
    process.exit(1);
  }

  console.log(`Creating/updating Admin user...`);
  console.log(`Email: ${email}`);
  console.log(`Name: ${name}`);

  try {
    const role = await prisma.role.findUnique({
      where: { name: 'Admin' }
    });

    if (!role) {
      console.error('Error: "Admin" role not found in database. Please run "npx prisma db push" and "npx prisma db seed" first.');
      process.exit(1);
    }

    const dept = await prisma.department.findFirst({
      where: { name: 'CMD Office' }
    });

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        roleId: role.id,
        name,
        initials,
        active: true,
      },
      create: {
        email,
        passwordHash,
        name,
        initials,
        roleId: role.id,
        departmentId: dept ? dept.id : null,
        active: true,
      }
    });

    console.log(`Successfully created/updated Admin user!`);
    console.log(`ID: ${user.id}`);
  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
