import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { DashboardGeneralService } from '../services/dashboard-general.service';
import { DashboardProyectoService } from '../services/dashboard-proyecto.service';
import { DashboardActividadService } from '../services/dashboard-actividad.service';
import { DashboardOeiService } from '../services/dashboard-oei.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/constants/roles.constant';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(
    private readonly dashboardGeneralService: DashboardGeneralService,
    private readonly dashboardProyectoService: DashboardProyectoService,
    private readonly dashboardActividadService: DashboardActividadService,
    private readonly dashboardOeiService: DashboardOeiService,
  ) {}

  // Dashboard General
  @Get()
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR)
  getDashboardGeneral() {
    return this.dashboardGeneralService.getDashboard();
  }

  @Get('alertas')
  @Roles(Role.ADMIN, Role.PMO)
  getAlertas() {
    return this.dashboardGeneralService.getAlertas();
  }

  // Dashboard Proyecto
  @Get('proyecto/:id')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER, Role.DESARROLLADOR)
  getDashboardProyecto(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardProyectoService.getDashboard(id);
  }

  @Get('proyecto/:id/burndown')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER, Role.DESARROLLADOR)
  getBurndownProyecto(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardProyectoService.getBurndown(id);
  }

  @Get('proyecto/:id/velocidad')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.SCRUM_MASTER, Role.DESARROLLADOR)
  getVelocidadProyecto(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardProyectoService.getVelocidad(id);
  }

  // Dashboard Actividad
  @Get('actividad/:id')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.IMPLEMENTADOR)
  getDashboardActividad(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardActividadService.getDashboard(id);
  }

  @Get('actividad/:id/throughput')
  @Roles(Role.ADMIN, Role.PMO, Role.COORDINADOR, Role.IMPLEMENTADOR)
  getThroughputActividad(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardActividadService.getThroughput(id);
  }

  // Dashboard OEI (Estratégico)
  @Get('oei')
  @Roles(Role.ADMIN, Role.PMO)
  getDashboardOei() {
    return this.dashboardOeiService.getDashboard();
  }
}
