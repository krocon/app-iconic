import { Injectable } from '@angular/core';
import { call } from '../backend/call';
import { TraceOptions, TraceResult } from './trace.models';

/**
 * Tracing an image into SVG (prompt 087): Rust (`trace_image`, visioncortex) turns a PNG data URL
 * into the markup of a new layer. Tests and the browser mode use `FakeTraceApi`.
 */
@Injectable()
export abstract class TraceApi {
  /** Errors: `invalid_image`, `too_large`, `invalid_request`. */
  abstract traceImage(dataUrl: string, options: Partial<TraceOptions>): Promise<TraceResult>;
}

@Injectable()
export class TauriTraceApi extends TraceApi {
  traceImage(dataUrl: string, options: Partial<TraceOptions>): Promise<TraceResult> {
    return call<TraceResult>('trace_image', { dataUrl, options });
  }
}
