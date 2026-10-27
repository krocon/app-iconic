import { Injectable } from '@angular/core';
import { call } from '../backend/call';
import { AppInfo } from './about.models';

/** Typed facade of `get_app_info` and `third_party_notices`. */
export abstract class AboutApi {
  abstract appInfo(): Promise<AppInfo>;
  /** The licence texts of everything inside the app (`THIRD-PARTY-NOTICES.txt`, design 030 E7). */
  abstract thirdPartyNotices(): Promise<string>;
}

@Injectable()
export class TauriAboutApi extends AboutApi {
  appInfo(): Promise<AppInfo> {
    return call<AppInfo>('get_app_info');
  }

  thirdPartyNotices(): Promise<string> {
    return call<string>('third_party_notices');
  }
}
