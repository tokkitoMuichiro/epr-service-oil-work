import type { DatabaseSeed } from '../../db.js'
import { EQUIPMENT_KEY } from '../../modules/equipment/model.js'
import { PERSONNEL_KEY } from '../../modules/personnel/model.js'
import { MOCK_DISK_KEY } from '../../disk/mock.js'
import { demoContracts } from './contracts.js'
import { demoEquipment, demoEquipmentFiles } from './equipment.js'
import { demoPersonnel, demoPersonnelFiles } from './personnel.js'
import { demoReports } from './reports.js'
import { demoMockDisk, demoTraining } from './training.js'

export const demoSeed: DatabaseSeed = {
  snapshots: {
    contracts: demoContracts,
    reports: demoReports,
    [EQUIPMENT_KEY]: demoEquipment,
    [PERSONNEL_KEY]: demoPersonnel,
    training: demoTraining,
    [MOCK_DISK_KEY]: demoMockDisk,
  },
  files: () => [...demoPersonnelFiles(), ...demoEquipmentFiles()],
}
