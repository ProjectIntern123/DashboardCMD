import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/notepad.dto';

@Injectable()
export class NotepadService {
  constructor(private prisma: PrismaService) {}

  async create(createNoteDto: CreateNoteDto, userId: string) {
    const images = createNoteDto.images ? JSON.parse(createNoteDto.images) : [];

    return this.prisma.notepadNote.create({
      data: {
        userId,
        title: createNoteDto.title,
        text: createNoteDto.text || '',
        images,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.notepadNote.findMany({
      where: { userId },
      orderBy: {
        ts: 'desc',
      },
    });
  }

  async findOne(id: string, userId: string) {
    const note = await this.prisma.notepadNote.findUnique({
      where: { id },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('You do not have access to this note');
    }

    return note;
  }

  async update(id: string, updateNoteDto: UpdateNoteDto, userId: string) {
    const note = await this.findOne(id, userId); // verifies existence and owner

    const images = updateNoteDto.images ? JSON.parse(updateNoteDto.images) : note.images;

    return this.prisma.notepadNote.update({
      where: { id },
      data: {
        title: updateNoteDto.title,
        text: updateNoteDto.text || '',
        images,
        ts: new Date(),
      },
    });
  }

  async clearAll(userId: string) {
    await this.prisma.notepadNote.deleteMany({
      where: { userId },
    });

    // Create a new blank Quick Note to ensure user has a canvas on next load
    return this.prisma.notepadNote.create({
      data: {
        userId,
        title: 'Quick Notes',
        text: '',
        images: [],
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId); // verifies existence and owner

    await this.prisma.notepadNote.delete({
      where: { id },
    });

    return { success: true, message: 'Note deleted successfully' };
  }
}
