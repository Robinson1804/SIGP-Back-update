import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CronogramaService } from '../services/cronograma.service';
import { TareaCronogramaService } from '../services/tarea-cronograma.service';
import { CreateCronogramaDto } from '../dto/create-cronograma.dto';
import { UpdateCronogramaDto } from '../dto/update-cronograma.dto';
import { CreateTareaCronogramaDto } from '../dto/create-tarea-cronograma.dto';
import { UpdateTareaCronogramaDto } from '../dto/update-tarea-cronograma.dto';
import { CronogramaEstado } from '../enums/cronograma.enum';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Role } from '../../../../common/constants/roles.constant';

@Controller('cronogramas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CronogramaController {
  constructor(private readonly cronogramaService: CronogramaService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER)
  create(@Body() createDto: CreateCronogramaDto, @CurrentUser('id') userId: number) {
    return this.cronogramaService.create(createDto, userId);
  }

  @Get()
  findAll(
    @Query('proyectoId') proyectoId?: string,
    @Query('estado') estado?: CronogramaEstado,
    @Query('activo') activo?: string,
  ) {
    return this.cronogramaService.findAll({
      proyectoId: proyectoId ? parseInt(proyectoId, 10) : undefined,
      estado,
      activo: activo !== undefined ? activo === 'true' : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cronogramaService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateCronogramaDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.cronogramaService.update(id, updateDto, userId);
  }

  @Post(':id/estado')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR)
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body('estado') estado: CronogramaEstado,
    @CurrentUser('id') userId: number,
  ) {
    return this.cronogramaService.cambiarEstado(id, estado, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.cronogramaService.remove(id, userId);
  }
}

@Controller('proyectos/:proyectoId/cronogramas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProyectoCronogramasController {
  constructor(private readonly cronogramaService: CronogramaService) {}

  @Get()
  findByProyecto(@Param('proyectoId', ParseIntPipe) proyectoId: number) {
    return this.cronogramaService.findByProyecto(proyectoId);
  }
}

@Controller('tareas-cronograma')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TareaCronogramaController {
  constructor(private readonly tareaCronogramaService: TareaCronogramaService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER)
  create(@Body() createDto: CreateTareaCronogramaDto, @CurrentUser('id') userId: number) {
    return this.tareaCronogramaService.create(createDto, userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tareaCronogramaService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER, Role.DESARROLLADOR)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTareaCronogramaDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.tareaCronogramaService.update(id, updateDto, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.tareaCronogramaService.remove(id, userId);
  }
}

@Controller('cronogramas/:cronogramaId/tareas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CronogramaTareasController {
  constructor(private readonly tareaCronogramaService: TareaCronogramaService) {}

  @Get()
  findByCronograma(@Param('cronogramaId', ParseIntPipe) cronogramaId: number) {
    return this.tareaCronogramaService.findByCronograma(cronogramaId);
  }
}
