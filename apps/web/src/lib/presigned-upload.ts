/**
 * Uploads a file to a presigned S3 PUT URL.
 * Throws if the server returns a non-2xx response.
 */
export async function putToPresignedUrl(
	url: string,
	file: File,
): Promise<void> {
	const response = await fetch(url, {
		method: "PUT",
		body: file,
		headers: { "Content-Type": file.type },
	})
	if (!response.ok) {
		throw new Error(
			`Presigned upload failed: ${response.status} ${response.statusText}`,
		)
	}
}
