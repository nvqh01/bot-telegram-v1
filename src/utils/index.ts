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
