import { Test, TestingModule } from '@nestjs/testing';
import { ActionItemController } from './action-item.controller';
import { ActionItemService } from './action-item.service';
import { RemarkChannel } from './dto/action-item.dto';

describe('ActionItemController - Remark Routing & Access Control', () => {
  let controller: ActionItemController;
  let actionItemService: Partial<ActionItemService>;

  beforeEach(async () => {
    actionItemService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'action-123' }),
      create: jest.fn().mockResolvedValue({ id: 'action-123' }),
      update: jest.fn().mockResolvedValue({ id: 'action-123' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'action-123' }),
      updatePriority: jest.fn().mockResolvedValue({ id: 'action-123' }),
      remove: jest.fn().mockResolvedValue({ id: 'action-123' }),
      getRemarks: jest.fn().mockResolvedValue({ userRemarks: [], cmdRemarks: [] }),
      createRemark: jest.fn().mockResolvedValue({ id: 'rem-1' }),
      updateRemark: jest.fn().mockResolvedValue({ id: 'rem-1' }),
      deleteRemark: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActionItemController],
      providers: [{ provide: ActionItemService, useValue: actionItemService }],
    }).compile();

    controller = module.get<ActionItemController>(ActionItemController);
  });

  it('delegates getRemarks to actionItemService.getRemarks', async () => {
    await controller.getRemarks('action-123');
    expect(actionItemService.getRemarks).toHaveBeenCalledWith('action-123');
  });

  it('delegates createRemark with trusted user identity to actionItemService.createRemark', async () => {
    const user = { id: 'user-cmd', name: 'CMD', role: 'CMD' };
    const dto = { text: 'New directive', channel: RemarkChannel.CMD };

    await controller.createRemark('action-123', dto, user);

    expect(actionItemService.createRemark).toHaveBeenCalledWith(
      'action-123',
      dto,
      expect.objectContaining({ id: 'user-cmd', name: 'CMD', role: 'CMD' }),
    );
  });

  it('delegates updateRemark and deleteRemark', async () => {
    const user = { id: 'user-1', role: 'Management' };
    await controller.updateRemark('action-123', 'rem-1', { text: 'Updated' }, user);
    expect(actionItemService.updateRemark).toHaveBeenCalledWith(
      'action-123',
      'rem-1',
      { text: 'Updated' },
      expect.objectContaining({ id: 'user-1', role: 'Management' }),
    );

    await controller.deleteRemark('action-123', 'rem-1', user);
    expect(actionItemService.deleteRemark).toHaveBeenCalledWith(
      'action-123',
      'rem-1',
      expect.objectContaining({ id: 'user-1', role: 'Management' }),
    );
  });
});
