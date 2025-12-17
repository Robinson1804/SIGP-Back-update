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
import { DivisionService } from '../services/division.service';
import { CreateDivisionDto } from '../dto/create-division.dto';
import { UpdateDivisionDto } from '../dto/update-division.dto';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Role } from '../../../../common/constants/roles.constant';

@Controller('divisiones')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DivisionController {
  constructor(private readonly divisionService: DivisionService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PMO)
  create(@Body() createDto: CreateDivisionDto, @CurrentUser('id') userId: number) {
    return this.divisionService.create(createDto, userId);
  }

  @Get()
  findAll(@Query('activo') activo?: string) {
    return this.divisionService.findAll(
      activo !== undefined ? activo === 'true' : undefined,
    );
  }

  @Get('arbol')
  getArbol() {
    return this.divisionService.getArbol();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.divisionService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PMO)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateDivisionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.divisionService.update(id, updateDto, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PMO)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.divisionService.remove(id, userId);
  }
}
