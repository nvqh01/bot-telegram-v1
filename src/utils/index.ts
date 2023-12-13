export * from './crawl-html';
export * from './get-twitter-cookies';

export async function catchAsync<T = any>(
  context: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error: any) {
    console.log(
      'Meet error at method "%s" (Context: "%s") with error: %s',
      fn.name,
      context,
      error.stack,
    );
    return null;
  }
}

let index = 0;
export function getRoundRobin<T = any>(arr: T[]): T {
  index > arr.length && (index = 0);
  return arr[arr.length % index++];
}
