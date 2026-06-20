import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

async function seedStaging() {
  console.log('🌱 Seeding staging database...');

  // Create test admin user
  console.log('Creating admin user...');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@staging.bluecollar.example.com' },
    update: {},
    create: {
      email: 'admin@staging.bluecollar.example.com',
      password: await hashPassword('staging-admin-2024'),
      role: 'ADMIN',
      is_verified: true,
      name: 'Staging Admin',
    },
  });

  // Create test regular users
  console.log('Creating test users...');
  const users = [];
  for (let i = 0; i < 10; i++) {
    const user = await prisma.user.create({
      data: {
        email: `user${i}@staging.bluecollar.example.com`,
        password: await hashPassword('staging-user-2024'),
        role: 'USER',
        is_verified: true,
        name: faker.person.fullName(),
      },
    });
    users.push(user);
  }

  // Create test workers
  console.log('Creating test workers...');
  const categories = ['plumber', 'electrician', 'carpenter', 'painter', 'mechanic'];
  const workers = [];
  
  for (let i = 0; i < 50; i++) {
    const worker = await prisma.worker.create({
      data: {
        name: faker.person.fullName(),
        category: faker.helpers.arrayElement(categories),
        wallet_address: `G${faker.string.alphanumeric(55).toUpperCase()}`,
        owner_id: faker.helpers.arrayElement([admin.id, ...users.map(u => u.id)]),
        is_active: faker.datatype.boolean(0.9), // 90% active
        rating: faker.number.float({ min: 3.5, max: 5, precision: 0.1 }),
        description: faker.lorem.paragraph(),
        hourly_rate: faker.number.int({ min: 25, max: 150 }),
      },
    });
    workers.push(worker);
  }

  // Create test jobs
  console.log('Creating test jobs...');
  const jobStatuses = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  
  for (let i = 0; i < 100; i++) {
    const status = faker.helpers.arrayElement(jobStatuses);
    const client = faker.helpers.arrayElement(users);
    const worker = status !== 'OPEN' ? faker.helpers.arrayElement(workers) : null;

    await prisma.job.create({
      data: {
        title: faker.lorem.sentence(),
        description: faker.lorem.paragraphs(2),
        category: faker.helpers.arrayElement(categories),
        budget: faker.number.int({ min: 100, max: 5000 }),
        status,
        client_id: client.id,
        worker_id: worker?.id,
        created_at: faker.date.past({ years: 1 }),
        updated_at: new Date(),
      },
    });
  }

  // Create test reviews
  console.log('Creating test reviews...');
  const completedJobs = await prisma.job.findMany({
    where: { status: 'COMPLETED' },
    take: 30,
  });

  for (const job of completedJobs) {
    if (job.worker_id) {
      await prisma.review.create({
        data: {
          job_id: job.id,
          reviewer_id: job.client_id,
          reviewee_id: job.worker_id,
          rating: faker.number.int({ min: 3, max: 5 }),
          comment: faker.lorem.paragraph(),
          created_at: faker.date.recent({ days: 30 }),
        },
      });
    }
  }

  // Create test messages
  console.log('Creating test messages...');
  for (let i = 0; i < 50; i++) {
    const sender = faker.helpers.arrayElement(users);
    const receiver = faker.helpers.arrayElement(users.filter(u => u.id !== sender.id));

    await prisma.message.create({
      data: {
        sender_id: sender.id,
        receiver_id: receiver.id,
        content: faker.lorem.sentences(2),
        is_read: faker.datatype.boolean(),
        created_at: faker.date.recent({ days: 7 }),
      },
    });
  }

  console.log('✅ Staging database seeded successfully!');
  console.log('\nTest Credentials:');
  console.log('Admin: admin@staging.bluecollar.example.com / staging-admin-2024');
  console.log('User: user0@staging.bluecollar.example.com / staging-user-2024');
  console.log(`\nCreated:`);
  console.log(`- ${users.length + 1} users`);
  console.log(`- ${workers.length} workers`);
  console.log(`- 100 jobs`);
  console.log(`- ${completedJobs.length} reviews`);
  console.log(`- 50 messages`);
}

seedStaging()
  .catch((e) => {
    console.error('❌ Error seeding staging database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
