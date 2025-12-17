import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notificacion } from './entities/notificacion.entity';
import { NotificacionService } from './services/notificacion.service';
import { NotificacionController } from './controllers/notificacion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Notificacion])],
  controllers: [NotificacionController],
  providers: [NotificacionService],
  exports: [NotificacionService],
})
export class NotificacionesModule {}
