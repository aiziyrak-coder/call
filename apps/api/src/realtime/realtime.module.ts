import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Socket.IO gateway yagona nusxada bo'lishi shart: har bir modul o'zi
 * provayder qilib qo'ysa, Nest bir nechta gateway yaratadi va hodisalar
 * faqat bittasidan chiqadi.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
