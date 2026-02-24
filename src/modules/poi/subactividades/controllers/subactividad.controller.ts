import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SubactividadService } from '../services/subactividad.service';
import { CreateSubactividadDto } from '../dto/create-subactividad.dto';
import { UpdateSubactividadDto } from '../dto/update-subactividad.dto';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Role } from '../../../../common/constants/roles.constant';

@Controller('subactividades')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubactividadController {
  constructor(private readonly subactividadService: SubactividadService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR)
  create(@Body() dto: CreateSubactividadDto, @CurrentUser('id') userId: number) {
    return this.subactividadService.create(dto, userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.subactividadService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubactividadDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.subactividadService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PMO)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.subactividadService.remove(id, userId);
  }

  @Post(':id/finalizar')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER)
  finalizarSubactividad(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.subactividadService.finalizarSubactividad(id, userId);
  }

  @Get(':id/verificar-tareas-finalizadas')
  verificarTareasFinalizadas(@Param('id', ParseIntPipe) id: number) {
    return this.subactividadService.verificarTareasFinalizadas(id);
  }

  @Get(':id/tareas')
  getTareas(@Param('id', ParseIntPipe) id: number) {
    return this.subactividadService.getTareas(id);
  }

  @Get(':id/metricas')
  getMetricas(@Param('id', ParseIntPipe) id: number) {
    return this.subactividadService.getMetricas(id);
  }
}

@Controller('actividades/:actividadId/subactividades')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActividadSubactividadesController {
  constructor(private readonly subactividadService: SubactividadService) {}

  @Get()
  findByActividad(@Param('actividadId', ParseIntPipe) actividadId: number) {
    return this.subactividadService.findByActividad(actividadId);
  }

  @Get('next-codigo')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR)
  getNextCodigo(@Param('actividadId', ParseIntPipe) actividadId: number) {
    return this.subactividadService.getNextCodigo(actividadId);
  }
}
