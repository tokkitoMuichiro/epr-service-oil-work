import { Router } from 'express'
import { requestUser } from '../../http.js'
import {
  canReadArea,
  canViewBlock,
  documentOverview,
  equipmentOverview,
  overviewObjects,
  overviewWindow,
  reportDaysOf,
  todayIso,
  type Overview,
} from '../../shared.js'
import type { AccessStore } from '../access/store.js'
import type { ContractsRepository } from '../contracts/repository.js'
import type { EquipmentService } from '../equipment/service.js'
import type { PersonnelRepository } from '../personnel/repository.js'
import type { ReportsRepository } from '../reports/repository.js'
import type { TrainingRepository } from '../training/repository.js'

export interface OverviewSources {
  access: AccessStore
  contracts: ContractsRepository
  reports: ReportsRepository
  equipment: EquipmentService
  personnel: PersonnelRepository
  training: TrainingRepository
  today?: () => string
}

export function overviewRouter(sources: OverviewSources) {
  const router = Router()

  router.get('/', (req, res) => {
    const user = requestUser(req)
    const permissions = sources.access.permissionsOf(user.role)
    const today = sources.today?.() ?? todayIso()
    const overview: Overview = {
      today,
      window: overviewWindow(today),
      objects: canReadArea(permissions, 'contracts')
        ? overviewObjects(sources.contracts.list(), reportDaysOf(sources.reports.list()), today)
        : null,
      equipment: canViewBlock(permissions, 'equipment') ? equipmentOverview(sources.equipment.state(user)) : null,
      documents: canReadArea(permissions, 'personnel')
        ? documentOverview(sources.personnel.listWorkers(user.role), today)
        : null,
      training: canViewBlock(permissions, 'training') ? sources.training.summary().counters : null,
      trainingAlerts: canViewBlock(permissions, 'training') ? sources.training.summary().alerts : null,
    }
    res.json({ item: overview })
  })

  return router
}
