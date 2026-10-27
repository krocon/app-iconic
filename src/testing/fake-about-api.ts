import { Injectable } from '@angular/core';
import { AboutApi } from '../app/core/about/about-api';
import { AppInfo } from '../app/core/about/about.models';

/** Test double of {@link AboutApi}. Never imported by app code. */
@Injectable()
export class FakeAboutApi extends AboutApi {
  info: AppInfo = { name: 'AppIconic', version: '0.0.0-test', os: 'linux', arch: 'x86_64' };

  notices = 'THIRD-PARTY NOTICES – AppIconic (fake)\n\nlucide-static 1.55.0 (ISC, npm)';

  appInfo(): Promise<AppInfo> {
    return Promise.resolve(this.info);
  }

  thirdPartyNotices(): Promise<string> {
    return Promise.resolve(this.notices);
  }
}
