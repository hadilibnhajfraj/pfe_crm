class Review {
  String userName='';
  String userImage='';
  double rating=0.0;
  String comment='';
  String timeAgo='';

  Review({
    required this.userName,
    required this.userImage,
    required this.rating,
    required this.comment,
    required this.timeAgo,
  });

  Review.fromJson(Map<String, dynamic> json) {
    userName = json['userName'] ?? '';
    userImage = json['userImage'] ?? '';
    comment = json['comment'] ?? '';
    timeAgo = json['timeAgo'] ?? '';
    rating = json['rating'] ?? 0.0;
  }
}
