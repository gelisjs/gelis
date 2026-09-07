const aotCaptureApplications = new WeakSet<object>();

export function markAotCaptureApplication(application: object): void {
  aotCaptureApplications.add(application);
}

export function isAotCaptureApplication(application: object): boolean {
  return aotCaptureApplications.has(application);
}
