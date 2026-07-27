


import 'package:dash_master_toolkit/dashboard/academic/model/review.dart';

class Course {
  String courseName = '';
  String courseDetail = '';
  String courseType = '';
  String status = '';
  String icon = '';
  String coverImage = '';
  String duration = '';
  double progress = 0.0;
  double rating = 0.0;
  double reviewsCount = 0.0;
  double averageRating = 0.0;
  int totalRatings = 0;
  int totalReviews = 0;
  int learnersCount = 0;
  List<CourseSection> courseContents = [];
  List<Review> reviewList = [];
  List<double> ratingPercentages = [];

  Course.fromJson(Map<String, dynamic> json) {
    courseName = json['courseName'] ?? '';
    courseDetail = json['courseDetail'] ?? '';
    courseType = json['courseType'] ?? '';
    status = json['status'] ?? '';
    icon = json['icon'] ?? '';
    duration = json['duration'] ?? '';
    coverImage = json['coverImage'] ?? '';
    progress = json['progress'] ?? 0.0;
    rating = json['rating'] ?? 0.0;
    reviewsCount = json['reviewsCount'] ?? 0.0;
    averageRating = json['averageRating'] ?? 0.0;
    totalRatings = json['totalRatings'] ?? 0;
    learnersCount = json['learnersCount'] ?? 0;
    totalReviews = json['totalReviews'] ?? 0;

    if (json['courseContents'] != null) {
      courseContents = (json['courseContents'] as List)
          .map((section) => CourseSection.fromJson(section))
          .toList();
    }
    if (json['reviewList'] != null) {
      reviewList = (json['reviewList'] as List)
          .map((section) => Review.fromJson(section))
          .toList();
    }

    ratingPercentages = json['ratingPercentages'] != null
        ? List<double>.from(json['ratingPercentages'])
        : [0.0, 0.0, 0.0, 0.0, 0.0];
  }
}

class CourseSection {
  String title = '';
  List<String> lessons = [];

  CourseSection.fromJson(Map<String, dynamic> json) {
    title = json['title'] ?? '';
    lessons = List<String>.from(json['lessons'] ?? []);
  }
}
