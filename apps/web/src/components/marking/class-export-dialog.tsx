"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
	type FlattenedValidationErrors,
	applyServerValidationErrors,
} from "@/lib/forms/apply-server-errors"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

const classExportSchema = z.object({
	className: z.string().trim(),
	teacherName: z.string().trim(),
	printLayout: z.enum(["none", "duplex", "duplex_2up"]),
	includeAnnotations: z.boolean(),
})

export type ClassExportFormValues = z.infer<typeof classExportSchema>

export const EMPTY_CLASS_EXPORT: ClassExportFormValues = {
	className: "",
	teacherName: "",
	printLayout: "duplex_2up",
	includeAnnotations: true,
}

const PRINT_LAYOUT_OPTIONS: Array<{
	value: ClassExportFormValues["printLayout"]
	label: string
	description: string
}> = [
	{
		value: "none",
		label: "No padding",
		description: "Leave student sections as-is (may bleed across sheets).",
	},
	{
		value: "duplex",
		label: "Duplex (pad to 2)",
		description: "Each student ends on an even page for double-sided printing.",
	},
	{
		value: "duplex_2up",
		label: "Duplex + 2-up (pad to 4)",
		description:
			"Each student ends on a 4-page boundary for 2-up double-sided printing.",
	},
]

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	submissionCount: number
	initialValue: ClassExportFormValues
	/**
	 * Returning a `FlattenedValidationErrors` triggers per-field `setError`
	 * inline. Returning `void`/`null` indicates success or a non-validation
	 * error already handled (typically as a toast) by the parent.
	 */
	onSubmit: (
		values: ClassExportFormValues,
	) =>
		| Promise<FlattenedValidationErrors | void | null>
		| FlattenedValidationErrors
		| void
		| null
	submitting?: boolean
}

export function ClassExportDialog({
	open,
	onOpenChange,
	submissionCount,
	initialValue,
	onSubmit,
	submitting = false,
}: Props) {
	const form = useForm<ClassExportFormValues>({
		resolver: zodResolver(classExportSchema),
		defaultValues: initialValue,
	})

	async function handleSubmit(values: ClassExportFormValues) {
		const ve = await onSubmit(values)
		if (ve) {
			applyServerValidationErrors(form, ve, {
				className: "className",
				teacherName: "teacherName",
			})
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!submitting) onOpenChange(v)
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Export class report</DialogTitle>
					<DialogDescription>
						{submissionCount} submission{submissionCount !== 1 ? "s" : ""}{" "}
						included. Add class info and pick a print layout.
					</DialogDescription>
				</DialogHeader>

				<form id="class-export-form" onSubmit={form.handleSubmit(handleSubmit)}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="className">Class</FieldLabel>
							<Input
								id="className"
								placeholder="e.g. 10B Biology"
								autoComplete="off"
								{...form.register("className")}
							/>
							<FieldError errors={[form.formState.errors.className]} />
						</Field>
						<Field>
							<FieldLabel htmlFor="teacherName">Teacher</FieldLabel>
							<Input
								id="teacherName"
								placeholder="e.g. Ms Smith"
								autoComplete="off"
								{...form.register("teacherName")}
							/>
							<FieldError errors={[form.formState.errors.teacherName]} />
						</Field>

						<FieldSet>
							<FieldLegend variant="label">Print layout</FieldLegend>
							<RadioGroup
								value={form.watch("printLayout")}
								onValueChange={(v) =>
									form.setValue(
										"printLayout",
										v as ClassExportFormValues["printLayout"],
									)
								}
							>
								{PRINT_LAYOUT_OPTIONS.map((opt) => (
									<FieldLabel
										key={opt.value}
										htmlFor={`print-${opt.value}`}
										className="cursor-pointer"
									>
										<Field orientation="horizontal">
											<RadioGroupItem
												id={`print-${opt.value}`}
												value={opt.value}
											/>
											<div className="flex flex-col">
												<span className="text-sm font-medium">{opt.label}</span>
												<span className="text-xs text-muted-foreground">
													{opt.description}
												</span>
											</div>
										</Field>
									</FieldLabel>
								))}
							</RadioGroup>
						</FieldSet>

						<FieldLabel htmlFor="includeAnnotations" className="cursor-pointer">
							<Field orientation="horizontal">
								<Checkbox
									id="includeAnnotations"
									checked={form.watch("includeAnnotations")}
									onCheckedChange={(checked) =>
										form.setValue("includeAnnotations", checked)
									}
								/>
								<div className="flex flex-col">
									<span className="text-sm font-medium">
										Include annotations
									</span>
									<span className="text-xs text-muted-foreground">
										Render inline marks on student answers and add a legend page
										at the end.
									</span>
								</div>
							</Field>
						</FieldLabel>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						Cancel
					</Button>
					<Button type="submit" form="class-export-form" disabled={submitting}>
						{submitting ? "Generating…" : "Generate PDF"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
