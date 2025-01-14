import { ImmutableObject } from 'seamless-immutable';

export interface Config {
  creationMode: DrawMode;
}

export enum DrawMode{
  SINGLE = 'single',
  CONTINUOUS = 'continuous',
  UPDATE = 'update'
}

export interface Config {
  filterField: string
}


export type IMConfig = ImmutableObject<Config>;
