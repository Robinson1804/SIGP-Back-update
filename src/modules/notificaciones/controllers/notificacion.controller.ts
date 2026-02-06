import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificacionService } from '../services/notificacion.service';
import { TipoNotificacion } from '../enums/tipo-notificacion.enum';
import { BulkDeleteDto, BulkDeleteProyectosDto, BulkDeleteActividadesDto } from '../dto/bulk-delete.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Role } from '../../../common/constants/roles.constant';

@Controller('notificaciones')
@UseGuards(JwtAuthGuard)
export class NotificacionController {
  constructor(private readonly notificacionService: NotificacionService) {}

  @Get()
  findAll(
    @CurrentUser('id') usuarioId: number,
    @Query('leida') leida?: string,
    @Query('tipo') tipo?: TipoNotificacion,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('proyectoId') proyectoId?: string,
    @Query('actividadId') actividadId?: string,
    @Query('entidadId') entidadId?: string,
  ) {
    return this.notificacionService.findAll(usuarioId, {
      leida: leida !== undefined ? leida === 'true' : undefined,
      tipo,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      proyectoId: proyectoId ? parseInt(proyectoId, 10) : undefined,
      actividadId: actividadId ? parseInt(actividadId, 10) : undefined,
      entidadId: entidadId ? parseInt(entidadId, 10) : undefined,
    });
  }

  @Get('conteo')
  getConteo(@CurrentUser('id') usuarioId: number) {
    return this.notificacionService.getConteo(usuarioId);
  }

  @Get('agrupadas/proyectos')
  findGroupedByProyecto(
    @CurrentUser('id') usuarioId: number,
    @Query('pgdId') pgdId?: string,
  ) {
    return this.notificacionService.findGroupedByProyecto(
      usuarioId,
      pgdId ? parseInt(pgdId, 10) : undefined,
    );
  }

  @Get('agrupadas/sprints/:proyectoId')
  findGroupedBySprint(
    @CurrentUser('id') usuarioId: number,
    @Param('proyectoId', ParseIntPipe) proyectoId: number,
  ) {
    return this.notificacionService.findGroupedBySprint(usuarioId, proyectoId);
  }

  @Get('agrupadas/actividades')
  @ApiOperation({ summary: 'Obtener notificaciones agrupadas por actividad' })
  findGroupedByActividad(
    @CurrentUser('id') usuarioId: number,
    @Query('pgdId') pgdId?: string,
  ) {
    return this.notificacionService.findGroupedByActividad(
      usuarioId,
      pgdId ? parseInt(pgdId, 10) : undefined,
    );
  }

  @Get('actividad/:actividadId/secciones')
  @ApiOperation({ summary: 'Obtener conteo de notificaciones por sección para una actividad' })
  getSeccionCountsByActividad(
    @CurrentUser('id') usuarioId: number,
    @Param('actividadId', ParseIntPipe) actividadId: number,
  ) {
    return this.notificacionService.getSeccionCountsByActividad(usuarioId, actividadId);
  }

  /**
   * Endpoint admin: listar notificaciones de un usuario específico
   */
  @Get('admin/usuario/:usuarioId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PMO)
  findAllByUser(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Query('tipo') tipo?: TipoNotificacion,
  ) {
    return this.notificacionService.findAll(usuarioId, { tipo });
  }

  @Get('proyecto/:proyectoId/secciones')
  @ApiOperation({ summary: 'Obtener conteo de notificaciones por sección para un proyecto' })
  getSeccionCountsByProyecto(
    @CurrentUser('id') usuarioId: number,
    @Param('proyectoId', ParseIntPipe) proyectoId: number,
  ) {
    return this.notificacionService.getSeccionCountsByProyecto(usuarioId, proyectoId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') usuarioId: number,
  ) {
    return this.notificacionService.findOne(id, usuarioId);
  }

  @Patch(':id/leer')
  marcarLeida(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') usuarioId: number,
  ) {
    return this.notificacionService.marcarLeida(id, usuarioId);
  }

  @Patch('leer-todas')
  marcarTodasLeidas(@CurrentUser('id') usuarioId: number) {
    return this.notificacionService.marcarTodasLeidas(usuarioId);
  }

  @Patch('leer-todas/proyecto/:proyectoId')
  marcarTodasLeidasPorProyecto(
    @CurrentUser('id') usuarioId: number,
    @Param('proyectoId', ParseIntPipe) proyectoId: number,
  ) {
    return this.notificacionService.marcarTodasLeidasPorProyecto(proyectoId, usuarioId);
  }

  @Patch('leer-todas/actividad/:actividadId')
  @ApiOperation({ summary: 'Marcar todas las notificaciones de una actividad como leídas' })
  marcarTodasLeidasPorActividad(
    @CurrentUser('id') usuarioId: number,
    @Param('actividadId', ParseIntPipe) actividadId: number,
  ) {
    return this.notificacionService.marcarTodasLeidasPorActividad(actividadId, usuarioId);
  }

  @Delete('bulk')
  softDeleteBulk(
    @CurrentUser('id') usuarioId: number,
    @Body() dto: BulkDeleteDto,
  ) {
    return this.notificacionService.softDeleteBulk(dto.ids, usuarioId);
  }

  @Delete('bulk/proyectos')
  softDeleteByProyectos(
    @CurrentUser('id') usuarioId: number,
    @Body() dto: BulkDeleteProyectosDto,
  ) {
    return this.notificacionService.softDeleteByProyectos(dto.proyectoIds, usuarioId);
  }

  @Delete('bulk/actividades')
  @ApiOperation({ summary: 'Eliminar notificaciones de actividades específicas' })
  softDeleteByActividades(
    @CurrentUser('id') usuarioId: number,
    @Body() dto: BulkDeleteActividadesDto,
  ) {
    return this.notificacionService.softDeleteByActividades(dto.actividadIds, usuarioId);
  }

  /**
   * Endpoint admin: eliminar notificación de cualquier usuario
   */
  @Delete('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PMO)
  removeAdmin(@Param('id', ParseIntPipe) id: number) {
    return this.notificacionService.removeAdmin(id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') usuarioId: number,
  ) {
    return this.notificacionService.remove(id, usuarioId);
  }
}
