export type CommandType =
  | 'start_mission'
  | 'pause'
  | 'resume'
  | 'abort'
  | 'return_to_surface'
  | 'set_heading'
  | 'set_speed';

export type CommandStatus = 'pending' | 'acknowledged' | 'failed';

export interface Command {
  id:        string;
  vehicleId: string;
  type:      CommandType;
  payload?:  Record<string, unknown>;
  sentAt:    number;
  status:    CommandStatus;
}

export interface CommandAck {
  commandId:  string;
  vehicleId:  string;
  status:     'acknowledged' | 'failed';
  message?:   string;
  timestamp:  number;
}
