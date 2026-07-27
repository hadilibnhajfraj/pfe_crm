// lib/application/users/model/project_comment_model.dart

class ProjectCommentModel {
  final String id;
  final String projectId;
  final String authorId;
  final String? parentId;
  final String body;
  final DateTime createdAt;

  final String authorName;
  final List<ProjectCommentModel> replies;

  // ✅ pour détecter si backend envoie le champ "replies"
  final bool hasRepliesField;

  ProjectCommentModel({
    required this.id,
    required this.projectId,
    required this.authorId,
    required this.body,
    required this.createdAt,
    required this.authorName,
    this.parentId,
    this.replies = const [],
    this.hasRepliesField = false,
  });

  ProjectCommentModel copyWith({
    String? id,
    String? projectId,
    String? authorId,
    String? parentId,
    String? body,
    DateTime? createdAt,
    String? authorName,
    List<ProjectCommentModel>? replies,
    bool? hasRepliesField,
  }) {
    return ProjectCommentModel(
      id: id ?? this.id,
      projectId: projectId ?? this.projectId,
      authorId: authorId ?? this.authorId,
      parentId: parentId ?? this.parentId,
      body: body ?? this.body,
      createdAt: createdAt ?? this.createdAt,
      authorName: authorName ?? this.authorName,
      replies: replies ?? this.replies,
      hasRepliesField: hasRepliesField ?? this.hasRepliesField,
    );
  }

  factory ProjectCommentModel.fromJson(Map<String, dynamic> json) {
    final user = json["User"] ?? json["user"];
    final name = (json["authorName"] ??
            user?["name"] ??
            user?["email"] ??
            "Inconnu")
        .toString();

    final hasRepliesKey = json.containsKey("replies");
    final repliesJson = json["replies"];

    return ProjectCommentModel(
      id: json["id"].toString(),
      projectId: json["projectId"].toString(),
      authorId: json["authorId"].toString(),
      parentId: json["parentId"]?.toString(),
      body: (json["body"] ?? "").toString(),
      createdAt: DateTime.tryParse((json["createdAt"] ?? "").toString()) ??
          DateTime.now(),
      authorName: name,
      hasRepliesField: hasRepliesKey,
      replies: (repliesJson is List)
          ? repliesJson
              .map((e) => ProjectCommentModel.fromJson(
                  Map<String, dynamic>.from(e as Map)))
              .toList()
          : const [],
    );
  }
}
