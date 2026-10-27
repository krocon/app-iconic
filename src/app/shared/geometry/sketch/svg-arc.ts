import { ArcParams } from '../path-data';
import { Point } from '../view-transform';

/**
 * Centre parameterisation of an SVG arc segment (SVG 1.1 implementation notes F.6.5/F.6.6):
 * radii scaled up when too small, angles in radians (document, y down), `delta` signed. Pure.
 */
export interface ArcCenter {
  c: Point;
  rx: number;
  ry: number;
  /** x-axis rotation in radians. */
  phi: number;
  theta1: number;
  delta: number;
}

export function arcCenter(start: Point, end: Point, arc: ArcParams): ArcCenter | null {
  let rx = Math.abs(arc.rx);
  let ry = Math.abs(arc.ry);
  if ((start.x === end.x && start.y === end.y) || rx === 0 || ry === 0) return null;
  const phi = (arc.rot * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let k = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (arc.large === arc.sweep) k = -k;
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const c = {
    x: cos * cx1 - sin * cy1 + (start.x + end.x) / 2,
    y: sin * cx1 + cos * cy1 + (start.y + end.y) / 2,
  };
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (x1 - cx1) / rx;
  const uy = (y1 - cy1) / ry;
  const vx = (-x1 - cx1) / rx;
  const vy = (-y1 - cy1) / ry;
  const theta1 = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, vx, vy);
  if (!arc.sweep && delta > 0) delta -= 2 * Math.PI;
  if (arc.sweep && delta < 0) delta += 2 * Math.PI;
  return { c, rx, ry, phi, theta1, delta };
}

/** Direction of travel of the arc at parameter angle `theta` (not normalised). */
export function arcTangentAt(a: ArcCenter, theta: number): Point {
  const sign = a.delta < 0 ? -1 : 1;
  const tx = -a.rx * Math.sin(theta) * sign;
  const ty = a.ry * Math.cos(theta) * sign;
  const cos = Math.cos(a.phi);
  const sin = Math.sin(a.phi);
  return { x: cos * tx - sin * ty, y: sin * tx + cos * ty };
}
