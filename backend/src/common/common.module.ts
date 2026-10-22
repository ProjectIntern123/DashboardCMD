import { Global, Module } from '@nestjs/common';
import { RecipientValidator } from './utils/recipient-validator';

@Global()
@Module({
  providers: [RecipientValidator],
  exports: [RecipientValidator],
})
export class CommonModule {}
