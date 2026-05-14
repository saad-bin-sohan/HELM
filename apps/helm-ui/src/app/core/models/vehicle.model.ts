export type VehicleType   = 'AUV' | 'ROV' | 'ASV';
export type VehicleStatus = 'idle' | 'active' | 'warning' | 'critical' | 'offline';

export interface Vehicle {
  id:              string;
  name:            string;
  type:            VehicleType;
  status:          VehicleStatus;
  activeMissionId: string | null;
  lastPingAt:      number; // Unix ms
}
