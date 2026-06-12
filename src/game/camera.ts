import * as THREE from 'three';

// The OSRS view: a perspective camera on a fixed ~48 degree pitch that orbits
// the player in 90 degree steps and zooms along its boom arm.
const PITCH = THREE.MathUtils.degToRad(48);

export class CameraRig {
  camera: THREE.PerspectiveCamera;

  private yaw = Math.PI;
  private targetYaw = Math.PI;
  private dist = 22;
  private targetDist = 22;
  private focus = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(32, aspect, 0.5, 400);
  }

  rotate(steps: number): void {
    this.targetYaw += steps * (Math.PI / 2);
  }

  rotateContinuous(radians: number): void {
    this.targetYaw += radians;
    this.yaw += radians;
  }

  zoom(delta: number): void {
    this.targetDist = THREE.MathUtils.clamp(this.targetDist + delta, 12, 34);
  }

  update(dt: number, target: THREE.Vector3): void {
    const k = Math.min(1, dt * 6);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.dist += (this.targetDist - this.dist) * k;
    this.focus.lerp(target, Math.min(1, dt * 8));
    const reach = Math.cos(PITCH) * this.dist;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * reach,
      this.focus.y + Math.sin(PITCH) * this.dist,
      this.focus.z + Math.cos(this.yaw) * reach,
    );
    this.camera.lookAt(this.focus.x, this.focus.y + 0.9, this.focus.z);
  }
}
