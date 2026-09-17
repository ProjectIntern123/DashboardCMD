import { Module } from '@nestjs/common';
import { NotepadService } from './notepad.service';
import { NotepadController } from './notepad.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [NotepadController],
  providers: [NotepadService],
  exports: [NotepadService],
})
export class NotepadModule {}
