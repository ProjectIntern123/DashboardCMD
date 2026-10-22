const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Cleaning Up Transactional & Demo Records ---');

  try {
    // Delete all transactional records in order of dependency constraints
    const attachmentsDeleted = await prisma.attachment.deleteMany({});
    console.log(`Deleted ${attachmentsDeleted.count} attachment entries`);

    const projectCommentsDeleted = await prisma.projectComment.deleteMany({});
    console.log(`Deleted ${projectCommentsDeleted.count} project comments`);

    const projectsDeleted = await prisma.project.deleteMany({});
    console.log(`Deleted ${projectsDeleted.count} project entries`);

    const tasksDeleted = await prisma.task.deleteMany({});
    console.log(`Deleted ${tasksDeleted.count} task entries`);

    const actionItemsDeleted = await prisma.actionItem.deleteMany({});
    console.log(`Deleted ${actionItemsDeleted.count} action items`);

    const escalationsDeleted = await prisma.escalation.deleteMany({});
    console.log(`Deleted ${escalationsDeleted.count} escalations`);

    const followUpsDeleted = await prisma.followUp.deleteMany({});
    console.log(`Deleted ${followUpsDeleted.count} follow-ups`);

    const legalCaseCommentsDeleted = await prisma.legalCaseComment.deleteMany({});
    console.log(`Deleted ${legalCaseCommentsDeleted.count} legal case comments`);

    const legalCasesDeleted = await prisma.legalCase.deleteMany({});
    console.log(`Deleted ${legalCasesDeleted.count} legal cases`);

    const notepadNotesDeleted = await prisma.notepadNote.deleteMany({});
    console.log(`Deleted ${notepadNotesDeleted.count} private notes`);

    const auditLogsDeleted = await prisma.auditLog.deleteMany({});
    console.log(`Deleted ${auditLogsDeleted.count} audit logs`);

    const meetingsDeleted = await prisma.meeting.deleteMany({});
    console.log(`Deleted ${meetingsDeleted.count} meeting entries`);

    const employeesDeleted = await prisma.employee.deleteMany({});
    console.log(`Deleted ${employeesDeleted.count} employee profiles`);

    console.log('--- Database Transaction Cleanup Complete ---');
  } catch (error) {
    console.error('Error during database cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
