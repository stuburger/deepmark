import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UpdateMarkSchemeSchema } from "./schema";
import { mark_schemes, MarkScheme } from "../../db/collections/mark-schemes";

export const handler: ToolCallback<typeof UpdateMarkSchemeSchema> = async (
  args
) => {
  const { id, points_total, mark_points } = args;

  try {
    // Check if the mark scheme exists
    const existingMarkScheme = await mark_schemes.findOne({ _id: id });
    if (!existingMarkScheme) {
      return {
        content: [
          {
            type: "text",
            text: `Mark scheme with ID ${id} not found.`,
          },
        ],
      };
    }

    // Prepare update data
    const updateData: Partial<MarkScheme> = {
      updated_at: new Date(),
    };

    // Add optional fields if provided
    if (points_total !== undefined) {
      updateData.points_total = points_total;
    }

    if (mark_points !== undefined) {
      updateData.mark_points = mark_points;
    }

    // Validate points consistency if both fields are being updated
    if (points_total !== undefined && mark_points !== undefined) {
      // Validate that mark_points length matches points_total
      if (mark_points.length !== points_total) {
        return {
          content: [
            {
              type: "text",
              text: `Validation error: Number of mark points (${mark_points.length}) does not match points total (${points_total}).`,
            },
          ],
        };
      }

      // Validate that all mark points have points value of 1
      const invalidPoints = mark_points.filter((point) => point.points !== 1);
      if (invalidPoints.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `Validation error: All mark points must have a points value of 1. Found ${invalidPoints.length} invalid mark points.`,
            },
          ],
        };
      }
    }

    // If only mark_points is being updated, validate against existing points_total
    if (mark_points !== undefined && points_total === undefined) {
      if (mark_points.length !== existingMarkScheme.points_total) {
        return {
          content: [
            {
              type: "text",
              text: `Validation error: Number of mark points (${mark_points.length}) does not match existing points total (${existingMarkScheme.points_total}).`,
            },
          ],
        };
      }

      // Validate that all mark points have points value of 1
      const invalidPoints = mark_points.filter((point) => point.points !== 1);
      if (invalidPoints.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `Validation error: All mark points must have a points value of 1. Found ${invalidPoints.length} invalid mark points.`,
            },
          ],
        };
      }
    }

    // If only points_total is being updated, validate against existing mark_points
    if (points_total !== undefined && mark_points === undefined) {
      if (points_total !== existingMarkScheme.mark_points.length) {
        return {
          content: [
            {
              type: "text",
              text: `Validation error: Points total (${points_total}) does not match existing number of mark points (${existingMarkScheme.mark_points.length}).`,
            },
          ],
        };
      }
    }

    // Update the mark scheme in the database
    const result = await mark_schemes.updateOne(
      { _id: id },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Mark scheme with ID ${id} not found.`,
          },
        ],
      };
    }

    if (result.modifiedCount === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Mark scheme with ID ${id} was found but no changes were made.`,
          },
        ],
      };
    }

    // Get the updated mark scheme for response
    const updatedMarkScheme = await mark_schemes.findOne({ _id: id });

    return {
      content: [
        {
          type: "text",
          text: `Mark scheme updated successfully! Mark Scheme ID: ${id}\n\nUpdated Fields: ${Object.keys(
            updateData
          )
            .filter((key) => key !== "updated_at")
            .join(", ")}\nQuestion ID: ${
            updatedMarkScheme?.question_id
          }\nTotal Points: ${
            updatedMarkScheme?.points_total
          }\nNumber of Mark Points: ${updatedMarkScheme?.mark_points.length}`,
        },
      ],
    };
  } catch (error) {
    console.error("Error updating mark scheme:", error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to update mark scheme: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
};
