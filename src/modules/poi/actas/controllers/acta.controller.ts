import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ActaService } from '../services/acta.service';
import { CreateActaReunionDto } from '../dto/create-acta-reunion.dto';
import { CreateActaConstitucionDto } from '../dto/create-acta-constitucion.dto';
import { AprobarActaDto } from '../dto/aprobar-acta.dto';
import { ActaTipo, ActaEstado } from '../enums/acta.enum';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Role } from '../../../../common/constants/roles.constant';

@Controller('actas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActaController {
  constructor(private readonly actaService: ActaService) {}

  @Post('reunion')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER)
  createReunion(@Body() createDto: CreateActaReunionDto, @CurrentUser('id') userId: number) {
    return this.actaService.createReunion(createDto, userId);
  }

  @Post('constitucion')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR)
  createConstitucion(@Body() createDto: CreateActaConstitucionDto, @CurrentUser('id') userId: number) {
    return this.actaService.createConstitucion(createDto, userId);
  }

  @Get()
  findAll(
    @Query('proyectoId') proyectoId?: string,
    @Query('tipo') tipo?: ActaTipo,
    @Query('estado') estado?: ActaEstado,
    @Query('activo') activo?: string,
  ) {
    return this.actaService.findAll({
      proyectoId: proyectoId ? parseInt(proyectoId, 10) : undefined,
      tipo,
      estado,
      activo: activo !== undefined ? activo === 'true' : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.actaService.findOne(id);
  }

  @Post(':id/aprobar')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR)
  aprobar(
    @Param('id', ParseIntPipe) id: number,
    @Body() aprobarDto: AprobarActaDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.actaService.aprobar(id, aprobarDto, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.actaService.remove(id, userId);
  }
}

@Controller('proyectos/:proyectoId/actas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProyectoActasController {
  constructor(private readonly actaService: ActaService) {}

  @Get()
  findByProyecto(@Param('proyectoId', ParseIntPipe) proyectoId: number) {
    return this.actaService.findByProyecto(proyectoId);
  }
}
