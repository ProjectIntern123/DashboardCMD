import { Module } from '@nestjs/common';
import { ActionItemService } from './action-item.service';
import { ActionItemController } from './action-item.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ActionItemController],
  providers: [ActionItemService],
  exports: [ActionItemService],
})
export class ActionItemModule {}
